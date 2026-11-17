import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const reply = (status: number) => new Response(status === 200 ? "OK" : "Rejected", { status });
const encoder = new TextEncoder();
function equal(a: string, b: string): boolean {
  const aa = encoder.encode(a), bb = encoder.encode(b);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}
async function validSignature(url: string, params: URLSearchParams, signature: string, token: string) {
  // Twilio's form webhook signature: HMAC-SHA1 of exact public URL plus
  // lexicographically sorted parameter name/value pairs, base64 encoded.
  let payload = url;
  for (const key of [...new Set(params.keys())].sort()) {
    for (const value of params.getAll(key)) payload += key + value;
  }
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return equal(btoa(String.fromCharCode(...digest)), signature);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405);
  const publicUrl = Deno.env.get("SMS_TWILIO_STATUS_CALLBACK_URL");
  const token = Deno.env.get("SMS_TWILIO_AUTH_TOKEN");
  const sid = Deno.env.get("SMS_TWILIO_ACCOUNT_SID");
  const org = Deno.env.get("SMS_WORKER_ORGANIZATION_ID");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!publicUrl || !token || !sid || !org || !url || !key) return reply(503);
  // Only accept the exact registered public URL. Never use forwarded host headers.
  if (req.url !== publicUrl) return reply(403);
  const type = req.headers.get("content-type")?.split(";")[0].trim();
  if (type !== "application/x-www-form-urlencoded") return reply(415);
  const raw = await req.text();
  if (raw.length > 8192) return reply(413);
  const params = new URLSearchParams(raw);
  const signature = req.headers.get("X-Twilio-Signature") || "";
  if (!signature || !(await validSignature(publicUrl, params, signature, token))) return reply(403);
  if (params.get("AccountSid") !== sid) return reply(403);
  const messageSid = params.get("MessageSid");
  if (!messageSid || !/^SM[0-9a-f]{32}$/i.test(messageSid)) return reply(400);
  const providerStatus = params.get("MessageStatus")?.toLowerCase();
  const newStatus = providerStatus === "delivered" ? "delivered"
    : providerStatus === "failed" || providerStatus === "undelivered" ? "failed" : null;
  if (!newStatus) return reply(200); // queued/sent callbacks are informational.
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: message, error } = await db.from("sms_dispatch_queue")
    .select("id,status").eq("organization_id", org).eq("provider_message_sid", messageSid)
    .maybeSingle();
  if (error) return reply(503);
  if (!message) return reply(404);
  if (message.status === newStatus || message.status === "delivered") return reply(200);
  if (message.status !== "accepted" && !(message.status === "failed" && newStatus === "delivered")) {
    return reply(409);
  }
  const { data: updated, error: updateError } = await db.rpc("record_sms_dispatch_result", {
    p_dispatch_id: message.id, p_expected_status: message.status,
    p_new_status: newStatus, p_error_code: newStatus === "failed"
      ? String(params.get("ErrorCode") || "twilio_undelivered").slice(0, 64) : null,
  });
  if (updateError) return reply(503);
  return reply(updated ? 200 : 409);
});
