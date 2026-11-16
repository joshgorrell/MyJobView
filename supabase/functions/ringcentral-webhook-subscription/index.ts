import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  ringCentralAdminContext,
  phoneAdminHTTP,
  phoneAdminError,
} from "../_shared/phone-admin-context.ts";
import { syncVoicemailSubscription } from "../_shared/ringcentral-subscriptions.ts";
Deno.serve(async (request) => {
  const { reply, early } = phoneAdminHTTP(request, ["POST"]);
  if (early) return early;
  try {
    const { db, org, url, accountId, provider } =
      await ringCentralAdminContext(request);
    const secret = Deno.env.get("RINGCENTRAL_WEBHOOK_VERIFICATION_TOKEN");
    if (!secret) throw Error("not_configured");
    const { data: mailboxes, error } = await db
      .from("ringcentral_mailboxes")
      .select("ringcentral_extension_id")
      .eq("organization_id", org)
      .eq("ringcentral_account_id", accountId)
      .eq("enabled", true);
    if (error || !mailboxes?.length)
      return reply(409, { error: "no_enabled_mailboxes" });
    return reply(
      200,
      await syncVoicemailSubscription(
        provider,
        accountId,
        mailboxes.map((m) => m.ringcentral_extension_id),
        url.replace(/\/$/, "") + "/functions/v1/ringcentral-voicemail-webhook",
        secret,
        true,
      ),
    );
  } catch (cause) {
    const code = phoneAdminError(cause);
    return reply(
      code === "unauthorized" ? 401 : code === "admin_required" ? 403 : 503,
      { error: code },
    );
  }
});
