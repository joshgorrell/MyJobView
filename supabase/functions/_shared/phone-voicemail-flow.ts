import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { deliverVoicemailEmail } from "./phone-voicemail-email.ts";
/** Existing Flow + notification tables remain the only staff inbox. Mapping determines ownership. */
export async function publishVoicemailToFlow(
  db: SupabaseClient,
  input: {
    id: string;
    organizationId: string;
    department: string | null;
    summary: string | null;
    state: "ready" | "review" | "quarantined";
    urgent: boolean;
  },
) {
  if (input.state === "quarantined") return;
  const { data: message, error: messageError } = await db
    .from("voicemail_messages")
    .select(
      "ringcentral_account_id,ringcentral_extension_id,assigned_user_id,workflow_status,received_at,contact_id,service_request_id",
    )
    .eq("organization_id", input.organizationId)
    .eq("id", input.id)
    .maybeSingle();
  if (messageError || !message) throw Error("voicemail_lookup_failed");
  if (message.workflow_status === "completed" || message.service_request_id)
    return;
  const { data: mailbox, error: mailboxError } = await db
    .from("ringcentral_mailboxes")
    .select("id,default_department,escalation_minutes,display_name")
    .eq("organization_id", input.organizationId)
    .eq("ringcentral_account_id", message.ringcentral_account_id)
    .eq("ringcentral_extension_id", message.ringcentral_extension_id)
    .eq("enabled", true)
    .maybeSingle();
  if (mailboxError) throw Error("voicemail_mapping_lookup_failed");
  // Disabling ingestion also stops scheduled follow-up delivery for that mailbox.
  if (!mailbox) return;
  const eventType = "voicemail_messages.processed";
  const { data: existing, error: lookupError } = await db
    .from("flow_events")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("source_table", "voicemail_messages")
    .eq("source_id", input.id)
    .eq("event_type", eventType)
    .limit(1);
  if (lookupError) throw Error("voicemail_flow_lookup_failed");
  if (!existing?.length) {
    const { error } = await db
      .from("flow_events")
      .insert({
        organization_id: input.organizationId,
        contact_id: message.contact_id,
        category: "service",
        event_type: eventType,
        summary: input.urgent
          ? "Urgent voicemail needs attention"
          : "New voicemail needs attention",
        details: `Department: ${input.department ?? "Unclassified"}; status: ${input.state}. Review the Phone Voicemail inbox.`,
        source_table: "voicemail_messages",
        source_id: input.id,
        required_module: "feed",
        is_internal: true,
      });
    if (error && error.code !== "23505")
      throw Error("voicemail_flow_insert_failed");
  }
  const { data: grants, error: grantError } = await db
    .from("phone_voicemail_department_access")
    .select("user_id")
    .eq("organization_id", input.organizationId)
    .eq("department", input.department ?? "");
  const { data: mapped, error: mappedError } = await db
    .from("ringcentral_mailbox_recipients")
    .select("user_id,recipient_role,email_enabled")
    .eq("organization_id", input.organizationId)
    .eq("mailbox_id", mailbox.id);
  if (grantError || mappedError)
    throw Error("voicemail_recipient_lookup_failed");
  const granted = new Set((grants ?? []).map((g) => g.user_id));
  const configured = Boolean(mailbox.default_department);
  let recipients = configured
    ? (mapped ?? [])
    : (grants ?? []).map((g) => ({
        ...g,
        recipient_role: "responsible",
        email_enabled: false,
      }));
  // Review/unclassified or broken mappings must reach an active tenant administrator.
  if (
    !input.department ||
    !recipients.some(
      (r) => r.recipient_role === "responsible" && granted.has(r.user_id),
    )
  ) {
    const { data: admins, error } = await db
      .from("profiles")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("role", "admin")
      .eq("is_active", true)
      .eq("my_job_view_enabled", true);
    if (error) throw Error("voicemail_review_recipient_lookup_failed");
    recipients = (admins ?? []).map((p) => ({
      user_id: p.id,
      recipient_role: "responsible",
      email_enabled: false,
    }));
    for (const r of recipients) granted.add(r.user_id);
  }
  const ids = [...new Set(recipients.map((r) => r.user_id))];
  if (!ids.length) throw Error("voicemail_no_recipients");
  let { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id,email")
    .eq("organization_id", input.organizationId)
    .eq("is_active", true)
    .eq("my_job_view_enabled", true)
    .in("id", ids);
  if (profileError) throw Error("voicemail_recipient_authorization_failed");
  if (
    !recipients.some(
      (r) =>
        r.recipient_role === "responsible" &&
        granted.has(r.user_id) &&
        (profiles ?? []).some((p) => p.id === r.user_id),
    )
  ) {
    const { data: admins, error } = await db
      .from("profiles")
      .select("id,email")
      .eq("organization_id", input.organizationId)
      .eq("role", "admin")
      .eq("is_active", true)
      .eq("my_job_view_enabled", true);
    if (error || !admins?.length)
      throw Error("voicemail_no_eligible_recipients");
    profiles = [...(profiles ?? []), ...admins];
    for (const admin of admins) {
      const existing = recipients.find((r) => r.user_id === admin.id);
      if (existing) existing.recipient_role = "responsible";
      else
        recipients.push({
          user_id: admin.id,
          recipient_role: "responsible",
          email_enabled: false,
        });
      granted.add(admin.id);
    }
  }

  let failures = 0;
  for (const recipient of recipients) {
    const profile = (profiles ?? []).find((p) => p.id === recipient.user_id);
    if (!profile || !granted.has(profile.id)) continue;
    const backup = recipient.recipient_role === "backup";
    if (
      backup &&
      (message.workflow_status === "in_progress" ||
        Date.now() - Date.parse(message.received_at) <
          mailbox.escalation_minutes * 60000)
    )
      continue;
    const type = "phone_voicemail";
    const { data: notified, error } = await db
      .from("notifications")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", profile.id)
      .eq("related_id", input.id)
      .eq("type", type)
      .limit(1);
    if (error) throw Error("voicemail_notification_lookup_failed");
    if (!notified?.length) {
      const { error: e } = await db
        .from("notifications")
        .insert({
          organization_id: input.organizationId,
          user_id: profile.id,
          type,
          title: backup
            ? "Unhandled voicemail needs attention"
            : input.urgent
              ? "Urgent voicemail"
              : "New department voicemail",
          body: "Review the voicemail in MJV Flow and record the follow-up.",
          related_id: input.id,
        });
      if (e && e.code !== "23505")
        throw Error("voicemail_notification_insert_failed");
    }
    if (recipient.email_enabled && profile.email) {
      try {
        await deliverVoicemailEmail(db, {
          organizationId: input.organizationId,
          voicemailId: input.id,
          userId: profile.id,
          kind: backup ? "escalation" : "new",
          email: profile.email,
        });
      } catch {
        failures++;
      }
    }
  }
  if (failures) throw Error("voicemail_email_delivery_pending");
}
