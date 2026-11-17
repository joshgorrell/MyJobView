import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();
const response = (status: number, message = "") =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
async function signatureValid(url: string, params: URLSearchParams, signature: string, token: string) {
  let payload = url;
  for (const name of [...new Set(params.keys())].sort()) {
    for (const value of params.getAll(name)) payload += name + value;
  }
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  const expected = encoder.encode(btoa(String.fromCharCode(...digest)));
  const supplied = encoder.encode(signature);
  let diff = expected.length ^ supplied.length;
  for (let i = 0; i < Math.max(expected.length, supplied.length); i++) {
    diff |= (expected[i] ?? 0) ^ (supplied[i] ?? 0);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response(405);
  const publicUrl = Deno.env.get("SMS_TWILIO_INBOUND_WEBHOOK_URL");
  const token = Deno.env.get("SMS_TWILIO_AUTH_TOKEN");
  const accountSid = Deno.env.get("SMS_TWILIO_ACCOUNT_SID");
  const fromNumber = Deno.env.get("SMS_TWILIO_FROM_NUMBER");
  const org = Deno.env.get("SMS_WORKER_ORGANIZATION_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!publicUrl || !token || !accountSid || !fromNumber || !org || !supabaseUrl || !serviceKey) {
    return response(503);
  }
  if (req.url !== publicUrl) return response(403);
  if (req.headers.get("content-type")?.split(";")[0].trim() !== "application/x-www-form-urlencoded") {
    return response(415);
  }
  const raw = await req.text();
  if (raw.length > 8192) return response(413);
  const params = new URLSearchParams(raw);
  const signature = req.headers.get("X-Twilio-Signature") ?? "";
  if (!signature || !(await signatureValid(publicUrl, params, signature, token))) return response(403);
  if (params.get("AccountSid") !== accountSid || params.get("To") !== fromNumber) return response(403);
  const sender = params.get("From") ?? "";
  if (!/^[+][1-9][0-9]{7,14}$/.test(sender)) return response(400);
  const word = (params.get("Body") ?? "").trim().toUpperCase();
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const stop = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
  if (stop.has(word)) {
    const { error } = await db.from("sms_suppressions").upsert({
      organization_id: org, phone_e164: sender, reason: "stop",
    }, { onConflict: "organization_id,phone_e164" });
    if (error) return response(503);
    // Do not change contact consent; STOP is an immediate suppression.
    return response(200);
  }
  if (word === "START" || word === "UNSTOP") {
    // START is not proof of renewed consent for every message category.
    // Leave suppression in place pending an auditable opt-in workflow.
    return response(200);
  }
  if (word === "HELP" || word === "INFO") {
    // Empty TwiML: provider-managed compliance response may be configured.
    return response(200);
  }
  // Unrecognized messages are not acted upon or stored until two-way
  // messaging and a dealer-scoped inbox are implemented.
  return response(200);
});
