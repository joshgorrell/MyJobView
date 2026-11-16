import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  phoneAdminContext,
  ringCentralAdminContext,
  phoneAdminHTTP,
  phoneAdminError,
} from "../_shared/phone-admin-context.ts";
import { listRingCentralRecords } from "../_shared/ringcentral-directory.ts";
Deno.serve(async (request) => {
  const { reply, early } = phoneAdminHTTP(request, ["GET", "POST", "PUT"]);
  if (early) return early;
  try {
    if (request.method === "GET") {
      const { db, org } = await phoneAdminContext(request);
      const [mailboxes, people, recipients] = await Promise.all([
        db
          .from("ringcentral_mailboxes")
          .select(
            "id,display_name,extension_number,extension_type,ringcentral_extension_id,enabled,default_department,primary_user_id,escalation_minutes,version",
          )
          .eq("organization_id", org)
          .order("extension_number"),
        db
          .from("profiles")
          .select("id,full_name,email,my_job_view_enabled")
          .eq("organization_id", org)
          .eq("is_active", true)
          .order("full_name"),
        db
          .from("ringcentral_mailbox_recipients")
          .select("mailbox_id,user_id,recipient_role,email_enabled")
          .eq("organization_id", org),
      ]);
      if (mailboxes.error || people.error || recipients.error)
        throw Error("mapping_lookup_failed");
      const [failedEmail, uncertainEmail] = await Promise.all([
        db
          .from("phone_voicemail_email_deliveries")
          .select("voicemail_id", { count: "exact", head: true })
          .eq("organization_id", org)
          .eq("state", "failed"),
        db
          .from("phone_voicemail_email_deliveries")
          .select("voicemail_id", { count: "exact", head: true })
          .eq("organization_id", org)
          .eq("state", "unknown"),
      ]);
      if (failedEmail.error || uncertainEmail.error)
        throw Error("email_health_lookup_failed");
      return reply(200, {
        mailboxes: mailboxes.data,
        people: people.data,
        recipients: recipients.data,
        email_health: {
          failed: failedEmail.count ?? 0,
          unknown: uncertainEmail.count ?? 0,
        },
      });
    }
    if (request.method === "POST") {
      const { db, org, accountId, provider } =
        await ringCentralAdminContext(request);
      const input = await request.json();
      if (input.action === "scan") {
        if (
          typeof input.mailboxId !== "string" ||
          !/^[-0-9a-f]{36}$/i.test(input.mailboxId)
        )
          return reply(400, { error: "invalid_mailbox" });
        const { data: m, error } = await db
          .from("ringcentral_mailboxes")
          .select("ringcentral_extension_id")
          .eq("id", input.mailboxId)
          .eq("organization_id", org)
          .eq("ringcentral_account_id", accountId)
          .eq("enabled", true)
          .maybeSingle();
        if (error || !m)
          return reply(404, { error: "enabled_mailbox_required" });
        const from = new Date(Date.now() - 14 * 86400000).toISOString();
        const messages = await listRingCentralRecords(
          provider,
          `account/~/extension/${encodeURIComponent(m.ringcentral_extension_id)}/message-store?messageType=VoiceMail&dateFrom=${encodeURIComponent(from)}`,
        );
        const rows = messages
          .filter(
            (r) => r.type === "VoiceMail" && /^\d{1,32}$/.test(String(r.id)),
          )
          .map((r) => ({
            organization_id: org,
            ringcentral_account_id: accountId,
            ringcentral_extension_id: m.ringcentral_extension_id,
            ringcentral_message_id: String(r.id),
            state: "received",
            received_at:
              typeof r.creationTime === "string" &&
              Number.isFinite(Date.parse(r.creationTime))
                ? r.creationTime
                : new Date().toISOString(),
          }));
        if (!rows.length) return reply(200, { queued: 0 });
        const { data: queued, error: saveError } = await db
          .from("voicemail_messages")
          .upsert(rows, {
            onConflict:
              "organization_id,ringcentral_account_id,ringcentral_extension_id,ringcentral_message_id",
            ignoreDuplicates: true,
          })
          .select("id");
        if (saveError) throw Error("voicemail_scan_save_failed");
        return reply(200, { queued: queued?.length ?? 0 });
      }
      const rows = await listRingCentralRecords(
        provider,
        "account/~/extension",
      );
      const eligible = rows.filter(
        (r) =>
          /^\d{1,32}$/.test(String(r.id)) &&
          [
            "User",
            "Department",
            "Voicemail",
            "VirtualUser",
            "DigitalUser",
            "IvrMenu",
            "Announcement",
          ].includes(String(r.type)) &&
          r.status === "Enabled",
      );
      // Discovery never changes enablement, routing, recipients, or existing mappings.
      const { error } = await db.from("ringcentral_mailboxes").upsert(
        eligible.map((r) => ({
          organization_id: org,
          ringcentral_account_id: accountId,
          ringcentral_extension_id: String(r.id),
          enabled: false,
          display_name: String(r.name ?? "").slice(0, 200),
          extension_number: String(r.extensionNumber ?? "").slice(0, 32),
          extension_type: String(r.type),
        })),
        {
          onConflict: "ringcentral_account_id,ringcentral_extension_id",
          ignoreDuplicates: true,
        },
      );
      if (error) throw Error("discovery_save_failed");
      // Refresh labels separately so existing settings are preserved.
      for (const r of eligible) {
        const { error: e } = await db
          .from("ringcentral_mailboxes")
          .update({
            display_name: String(r.name ?? "").slice(0, 200),
            extension_number: String(r.extensionNumber ?? "").slice(0, 32),
            extension_type: String(r.type),
          })
          .eq("organization_id", org)
          .eq("ringcentral_account_id", accountId)
          .eq("ringcentral_extension_id", String(r.id));
        if (e) throw Error("discovery_save_failed");
      }
      return reply(200, { discovered: eligible.length });
    }
    const body = await request.json();
    if (
      typeof body.mailboxId !== "string" ||
      !/^[-0-9a-f]{36}$/i.test(body.mailboxId) ||
      typeof body.enabled !== "boolean" ||
      !Number.isInteger(body.version) ||
      !Number.isInteger(body.escalationMinutes) ||
      !Array.isArray(body.recipients)
    )
      return reply(400, { error: "invalid_mapping" });
    const { db, org, accountId, provider } =
      await ringCentralAdminContext(request);
    const { data: m, error: lookup } = await db
      .from("ringcentral_mailboxes")
      .select("ringcentral_extension_id")
      .eq("id", body.mailboxId)
      .eq("organization_id", org)
      .eq("ringcentral_account_id", accountId)
      .maybeSingle();
    if (lookup || !m) return reply(404, { error: "mailbox_not_found" });
    if (body.enabled) {
      const check = await provider(
        `account/~/extension/${encodeURIComponent(m.ringcentral_extension_id)}/message-store?messageType=VoiceMail&perPage=1`,
      );
      if (!check.ok)
        return reply(409, {
          error: "mailbox_read_permission_required",
          http_status: check.status,
        });
    }
    const { data: saved, error } = await db.rpc(
      "save_ringcentral_mailbox_mapping",
      {
        p_organization_id: org,
        p_mailbox_id: body.mailboxId,
        p_version: body.version,
        p_enabled: body.enabled,
        p_department: body.department || null,
        p_primary_user_id: body.primaryUserId || null,
        p_escalation_minutes: body.escalationMinutes,
        p_recipients: body.recipients,
      },
    );
    if (error)
      return reply(400, {
        error: "mapping_invalid_check_recipients_and_department",
      });
    if (!saved) return reply(409, { error: "mapping_changed_refresh" });
    return reply(200, { saved: true, subscription_sync_required: true });
  } catch (cause) {
    const code = phoneAdminError(cause);
    return reply(
      code === "unauthorized" ? 401 : code === "admin_required" ? 403 : 503,
      { error: code },
    );
  }
});
