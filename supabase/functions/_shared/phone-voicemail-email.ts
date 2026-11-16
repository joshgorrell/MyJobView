import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { sendSystemEmail } from "./system-email.ts";
/** Provider-idempotent email with durable receipts; no customer transcript/audio leaves MJV. */
export async function deliverVoicemailEmail(
  db: SupabaseClient,
  input: {
    organizationId: string;
    voicemailId: string;
    userId: string;
    kind: "new" | "escalation";
    email: string;
  },
) {
  const { data: settings, error } = await db
    .from("company_settings")
    .select("from_email,from_name,company_name,reply_to_email,app_url")
    .eq("organization_id", input.organizationId)
    .single();
  if (error || !settings?.from_email || !settings.app_url)
    throw Error("voicemail_email_settings_missing");
  const app = new URL(settings.app_url);
  if (app.protocol !== "https:") throw Error("voicemail_email_invalid_app_url");
  const { data: claimed, error: claimError } = await db.rpc(
    "claim_phone_voicemail_email",
    {
      p_organization_id: input.organizationId,
      p_voicemail_id: input.voicemailId,
      p_user_id: input.userId,
      p_kind: input.kind,
    },
  );
  if (claimError) throw Error("voicemail_email_claim_failed");
  if (!claimed) return;
  const receipt = () => db.from("phone_voicemail_email_deliveries");
  try {
    const escalation = input.kind === "escalation";
    const subject = escalation
      ? "Voicemail follow-up needs attention"
      : "New voicemail ready in MyJobView";
    const link = new URL("/flow", app.origin);
    link.searchParams.set("flowTab", "voicemails");
    const response = await sendSystemEmail({
      headers: {
        "Idempotency-Key": `voicemail-${input.voicemailId}-${input.userId}-${input.kind}`,
      },
      body: JSON.stringify({
        from: `${String(settings.from_name || settings.company_name || "MyJobView").replace(/[<>\r\n]/g, "")} <${settings.from_email}>`,
        to: [input.email],
        reply_to: settings.reply_to_email || settings.from_email,
        subject,
        text: `${escalation ? "An unhandled voicemail has reached its backup notification time." : "A voicemail is ready for your review."}\n\nOpen Flow to review the caller, recording and transcript, and create a service request:\n${link.toString()}`,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.id)
      throw Error("voicemail_email_provider_failed");
    const { error: saveError } = await receipt()
      .update({
        state: "sent",
        provider_id: result.id,
        lease_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", input.organizationId)
      .eq("voicemail_id", input.voicemailId)
      .eq("user_id", input.userId)
      .eq("kind", input.kind);
    if (saveError) throw Error("voicemail_email_receipt_failed");
  } catch (cause) {
    await receipt()
      .update({
        state: "failed",
        lease_until: null,
        next_attempt_at: new Date(Date.now() + 5 * 60000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", input.organizationId)
      .eq("voicemail_id", input.voicemailId)
      .eq("user_id", input.userId)
      .eq("kind", input.kind)
      .neq("state", "sent");
    throw cause;
  }
}
