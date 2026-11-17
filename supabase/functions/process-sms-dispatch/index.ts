import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
type Job = {
  id: string; organization_id: string; contact_id: string;
  category: string; to_phone: string; body: string; attempts: number;
};
const categoryFlag: Record<string, string> = {
  on_my_way: "on_my_way_enabled",
  appointment_reminder: "appointment_reminders_enabled",
  review_request: "review_requests_enabled",
  proposal_notification: "proposal_notifications_enabled",
};
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("SMS_WORKER_SECRET");
  const org = Deno.env.get("SMS_WORKER_ORGANIZATION_ID");
  const sid = Deno.env.get("SMS_TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("SMS_TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("SMS_TWILIO_FROM_NUMBER");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !org || !sid || !token || !from || !url || !key) {
    return json({ error: "Worker not configured" }, 503);
  }
  if (req.headers.get("X-SMS-Worker-Secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!/^[0-9a-f-]{36}$/i.test(org) || !/^AC[0-9a-f]{32}$/i.test(sid)) {
    return json({ error: "Invalid worker configuration" }, 503);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  // Fail abandoned claims without re-sending potentially accepted Twilio messages.\n  const { error: reconcileError } = await db.rpc("reconcile_stale_sms_dispatch", {\n    p_organization_id: org, p_stale_minutes: 30, p_limit: 50,\n  });\n  if (reconcileError) return json({ error: "Could not reconcile SMS claims" }, 503);\n  const { data, error } = await db.rpc("claim_sms_dispatch_for_org", {
    p_organization_id: org, p_limit: 10,
  });
  if (error) return json({ error: "Could not claim SMS batch" }, 503);
  let accepted = 0, skipped = 0, failed = 0;
  for (const job of (data || []) as Job[]) {
    const result = async (newStatus: string, errorCode: string | null = null, messageSid: string | null = null) =>
      db.rpc("record_sms_dispatch_result", {
        p_dispatch_id: job.id, p_expected_status: "processing",
        p_new_status: newStatus, p_provider_sid: messageSid, p_error_code: errorCode,
      });
    try {
      if (job.organization_id !== org || !categoryFlag[job.category]) {
        await result("suppressed", "invalid_scope"); skipped++; continue;
      }
      // Recheck gates immediately before the provider call.
      const [{ data: settings }, { data: contact }, { data: suppressions }] = await Promise.all([
        db.from("sms_automation_settings").select("*").eq("organization_id", org).single(),
        db.from("contacts").select("id,organization_id,phone,sms_opt_in")
          .eq("id", job.contact_id).eq("organization_id", org).single(),
        db.from("sms_suppressions").select("phone_e164").eq("organization_id", org)
          .eq("phone_e164", job.to_phone).limit(1),
      ]);
      if (!settings?.enabled || settings[categoryFlag[job.category]] !== true ||
          !contact?.sms_opt_in || contact.phone !== job.to_phone ||
          (suppressions?.length ?? 0) > 0) {
        await result("suppressed", "consent_or_settings"); skipped++; continue;
      }
      // The SQL claim enforces quiet hours. Recheck before sending, including midnight wrap.
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: settings.timezone, hour: "2-digit", minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date());
      const start = String(settings.quiet_hours_start).slice(0, 5);
      const end = String(settings.quiet_hours_end).slice(0, 5);
      const quiet = start === end ? false : start < end
        ? local >= start && local < end : local >= start || local < end;
      if (quiet) {
        await result("suppressed", "quiet_hours_changed"); skipped++; continue;
      }
      const callbackUrl = Deno.env.get("SMS_TWILIO_STATUS_CALLBACK_URL");
      if (!callbackUrl || !callbackUrl.startsWith("https://")) {
        await result("failed", "status_callback_not_configured"); failed++; continue;
      }
      const body = new URLSearchParams({
        To: job.to_phone, From: from, Body: job.body,
        StatusCallback: callbackUrl,
      });
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        { method: "POST", headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        }, body },
      );
      if (!response.ok) {
        await result("failed", `twilio_http_${response.status}`); failed++; continue;
      }
      const provider = await response.json();
      if (typeof provider.sid !== "string" || !/^SM[0-9a-f]{32}$/i.test(provider.sid)) {
        await result("failed", "missing_twilio_sid"); failed++; continue;
      }
      const { data: recorded, error: recordError } = await result("accepted", null, provider.sid);
      if (recordError || !recorded) {
        // Do not resend: Twilio accepted it; reconciliation is required.
        console.error("SMS accepted but ledger transition failed", job.id);
        failed++; continue;
      }
      accepted++;
    } catch {
      // Transport outcome may be unknown: do not retry automatically.
      await result("failed", "transport_outcome_unknown");
      failed++;
    }
  }
  return json({ processed: (data || []).length, accepted, skipped, failed });
});
