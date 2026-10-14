import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Staged endpoint: do not configure a live webhook until provider-specific
 * signature verification and recipient mapping are fully validated.
 */

// Resend webhook signatures use the Svix/Standard Webhooks signed payload:
// svix-id.svix-timestamp.raw-body, HMAC-SHA256, base64 v1 signature.
async function verifyResendSignature(body: string, headers: Headers, secret: string): Promise<boolean> {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature || !Number.isSafeInteger(Number(timestamp))) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  try {
    const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const keyBytes = Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    if (keyBytes.length < 16) return false;
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const message = new TextEncoder().encode(id + "." + timestamp + "." + body);
    for (const token of signature.split(" ")) {
      if (!token.startsWith("v1,")) continue;
      const signatureBytes = Uint8Array.from(atob(token.slice(3)), c => c.charCodeAt(0));
      if (await crypto.subtle.verify("HMAC", key, signatureBytes, message)) return true;
    }
  } catch { /* Fail closed on invalid encoding, key, or signature. */ }
  return false;
}

// Preserve display names as evidence, but compare only canonical mailbox addresses.
function mailbox(value: string): string | null {
  if (/[\r\n]/.test(value)) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(?:[^<>]*<)?([^<>\s@]+@[^<>\s@]+)(?:>)?$/);
  if (!match) return null;
  const address = match[1].toLowerCase();
  return address.length <= 320 && /^[^@]+@[^@]+\.[^@]+$/.test(address) ? address : null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  // Deliberate feature gate: default off even if deployed accidentally.
  if (Deno.env.get("SMART_INTAKE_EMAIL_ENABLED") !== "true") {
    return Response.json({ error: "Intake not enabled" }, { status: 503 });
  }
  if (Deno.env.get("SMART_INTAKE_EMAIL_PROVIDER") !== "resend") return Response.json({ error: "Provider not configured" }, { status: 503 });
  const webhookSecret = Deno.env.get("SMART_INTAKE_EMAIL_WEBHOOK_SECRET");
  if (!webhookSecret) return Response.json({ error: "Webhook not configured" }, { status: 503 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength < 0) return Response.json({ error: "Invalid content length" }, { status: 400 });
  if (contentLength > 1024 * 1024) return Response.json({ error: "Payload too large" }, { status: 413 });
  // Bound the actual stream: Content-Length is optional and cannot be trusted.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Empty payload" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) {
        await reader.cancel();
        return Response.json({ error: "Payload too large" }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return Response.json({ error: "Unable to read payload" }, { status: 400 });
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  let body: string;
  try { body = new TextDecoder("utf-8", { fatal: true }).decode(combined); }
  catch { return Response.json({ error: "Invalid UTF-8" }, { status: 400 }); }
  if (!body.trim()) return Response.json({ error: "Empty payload" }, { status: 400 });
  if (!(await verifyResendSignature(body, request.headers, webhookSecret))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let payload: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch { /* Invalid JSON is rejected below. */ }
  if (payload?.type !== "email.received") return Response.json({ error: "Unsupported event type" }, { status: 400 });
  const event = payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown> : null;
  const recipients = Array.isArray(event?.to) ? event.to.filter((value): value is string => typeof value === "string") : [];
  // A message addressed to several aliases is ambiguous: require exactly one.
  const recipient = recipients.length === 1 ? mailbox(recipients[0]) ?? "" : "";
  const eventId = typeof event?.email_id === "string" ? event.email_id.trim() : "";
  const sender = typeof event?.from === "string" ? event.from.trim() : "";
  const senderMailbox = mailbox(sender);
  const eventCreatedAt = typeof event?.created_at === "string" ? event.created_at : null;
  if (!event || recipients.length !== 1 || !recipient || !senderMailbox || !recipient || !eventId || !sender || eventId.length > 255 || recipient.length > 320 || sender.length > 320 || /[\r\n]/.test(recipient) || /[\r\n]/.test(sender) || /[\r\n]/.test(eventId)) return Response.json({ error: "Invalid event" }, { status: 400 });

  const dbUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!dbUrl || !serviceKey) return Response.json({ error: "Intake configuration unavailable" }, { status: 503 });
  const db = createClient(dbUrl, serviceKey);
  const { data: destinations, error: destinationError } = await db.from("intake_destinations")
    .select("organization_id,office_id,purpose,verified_at").eq("provider", "resend").eq("channel", "email")
    .eq("destination_address", recipient).eq("enabled", true);
  if (destinationError) return Response.json({ error: "Destination lookup failed" }, { status: 500 });
  if (!destinations || destinations.length !== 1) return Response.json({ error: "Unrecognized recipient" }, { status: 404 });
  const destination = destinations[0];
  if (!destination.verified_at || !["support", "sales"].includes(destination.purpose)) return Response.json({ error: "Destination not verified" }, { status: 403 });
  const { data, error } = await db.from("intake_items").upsert({
    organization_id: destination.organization_id, office_id: destination.office_id,
    channel: "email", provider: "resend", provider_event_id: eventId,
    source_address: sender, destination_address: recipient,
    subject: typeof event?.subject === "string" ? event.subject.slice(0, 1000) : null,
    raw_body: null, // Resend receipt webhooks contain metadata, not fetched email body.
    // Metadata-only receipts must not be treated as complete messages.
    status: "needs_review",
  }, { onConflict: "organization_id,channel,provider,provider_event_id", ignoreDuplicates: true })
    .select("id").maybeSingle();
  if (error) return Response.json({ error: "Unable to store intake" }, { status: 500 });
  // A provider retry may return no row from an ignoreDuplicates upsert.
  // Resolve the existing row without modifying its original evidence.
  let intakeId = data?.id ?? null;
  if (!intakeId) {
    const existing = await db.from("intake_items")
      .select("id")
      .eq("organization_id", destination.organization_id)
      .eq("channel", "email")
      .eq("provider", "resend")
      .eq("provider_event_id", eventId)
      .maybeSingle();
    if (existing.error || !existing.data) return Response.json({ error: "Unable to resolve stored intake" }, { status: 500 });
    intakeId = existing.data.id;
  }
  // Retrieve complete content only after tenant-scoped receipt persistence.
  // Keep the record in needs_review until attachment handling and verification are complete.
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey && /^[a-zA-Z0-9_-]{1,255}$/.test(eventId)) {
    try {
      const response = await fetch("https://api.resend.com/emails/receiving/" + encodeURIComponent(eventId), {
        headers: { Authorization: "Bearer " + resendKey },
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
          return Response.json({ error: "Invalid provider response", intakeId }, { status: 503 });
        }
        const received: unknown = await response.json();
        if (received && typeof received === "object" && !Array.isArray(received)) {
          const email = received as Record<string, unknown>;
          const retrievedTo = Array.isArray(email.to) ? email.to : [];
          if (email.id === eventId && typeof email.from === "string" &&
              mailbox(email.from) === senderMailbox && retrievedTo.length === 1 &&
              typeof retrievedTo[0] === "string" && mailbox(retrievedTo[0]) === recipient) {
            // Do not acknowledge emails whose attachments have not been preserved.
            // A separate ingestion stage must persist and scan each attachment.
            const attachments = email.attachments;
            if (Array.isArray(attachments) && attachments.length > 0) {
              console.error("Intake attachments require secure persistence", { intakeId, count: attachments.length });
              return Response.json({ error: "Attachment processing pending", intakeId }, {
                status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
              });
            }
            if (attachments !== undefined && !Array.isArray(attachments)) {
              return Response.json({ error: "Invalid attachment metadata", intakeId }, { status: 503 });
            }
            const text = typeof email.text === "string" ? email.text : null;
            if (text !== null && new TextEncoder().encode(text).byteLength <= 1024 * 1024) {
              const { error: contentError } = await db.from("intake_items").update({ raw_body: text })
                .eq("id", intakeId).eq("organization_id", destination.organization_id)
                .is("raw_body", null);
              if (contentError) console.error("Intake content persistence failed", { intakeId, code: contentError.code });
            }
          } else {
            console.error("Received email identity mismatch", { intakeId });
          }
        }
      } else {
        console.error("Received email retrieval unavailable", { intakeId, status: response.status });
      }
    } catch {
      console.error("Received email retrieval failed", { intakeId });
    }
  }
  // Capture a minimal audit event on first receipt; never duplicate it on retries.
  if (data?.id) {
    const { error: eventError } = await db.from("intake_events").insert({
      intake_id: intakeId,
      actor_type: "provider",
      event_type: "email_received",
      detail: { destination_purpose: destination.purpose, provider: "resend", provider_created_at: eventCreatedAt, content_pending: true },
    });
    if (eventError) console.error("Intake audit event failed", { intakeId, code: eventError.code });
  }
  // Retryable retrieval must never be silently acknowledged as completed.
  // Provider retries can safely re-enter because intake_items is idempotent.
  const { data: storedContent, error: storedContentError } = await db.from("intake_items")
    .select("raw_body").eq("id", intakeId).eq("organization_id", destination.organization_id).single();
  if (storedContentError) return Response.json({ error: "Unable to verify intake content" }, { status: 503 });
  if (storedContent.raw_body === null) {
    return Response.json({ error: "Email content pending retrieval", intakeId }, { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  }
  return Response.json({ accepted: true, intakeId }, { headers: { "Cache-Control": "no-store" } });
});
