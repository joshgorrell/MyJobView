import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Staged endpoint: do not configure a live webhook until provider-specific
 * signature verification and recipient mapping are fully validated.
 */
Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  // Deliberate feature gate: default off even if deployed accidentally.
  if (Deno.env.get("SMART_INTAKE_EMAIL_ENABLED") !== "true") {
    return Response.json({ error: "Intake not enabled" }, { status: 503 });
  }
  const expected = Deno.env.get("SMART_INTAKE_EMAIL_WEBHOOK_SECRET");
  const provided = request.headers.get("x-webhook-secret");
  if (!expected || !provided || expected !== provided) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1024 * 1024) return Response.json({ error: "Payload too large" }, { status: 413 });
  const body = await request.text().catch(() => "");
  if (new TextEncoder().encode(body).byteLength > 1024 * 1024) return Response.json({ error: "Payload too large" }, { status: 413 });
  let payload: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch { /* Invalid JSON is rejected below. */ }
  const recipient = typeof payload?.to === "string" ? payload.to.trim().toLowerCase() : "";
  const eventId = typeof payload?.email_id === "string" ? payload.email_id.trim() : "";
  const sender = typeof payload?.from === "string" ? payload.from.trim() : "";
  if (!recipient || !eventId || !sender || eventId.length > 255 || recipient.length > 320 || sender.length > 320) return Response.json({ error: "Invalid event" }, { status: 400 });

  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data: destinations, error: destinationError } = await db.from("intake_destinations")
    .select("organization_id,office_id,purpose,verified_at").eq("channel", "email")
    .eq("destination_address", recipient).eq("enabled", true);
  if (destinationError) return Response.json({ error: "Destination lookup failed" }, { status: 500 });
  if (!destinations || destinations.length !== 1) return Response.json({ error: "Unrecognized recipient" }, { status: 404 });
  const destination = destinations[0];
  if (!destination.verified_at || !["support", "sales"].includes(destination.purpose)) return Response.json({ error: "Destination not verified" }, { status: 403 });
  const { data, error } = await db.from("intake_items").upsert({
    organization_id: destination.organization_id, office_id: destination.office_id,
    channel: "email", provider: "resend", provider_event_id: eventId,
    source_address: sender, destination_address: recipient,
    subject: typeof payload.subject === "string" ? payload.subject : null,
    raw_body: typeof payload.text === "string" ? payload.text : null,
    status: "received",
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
  // Capture a minimal audit event on first receipt; never duplicate it on retries.
  if (data?.id) {
    const { error: eventError } = await db.from("intake_events").insert({
      intake_id: intakeId,
      actor_type: "provider",
      event_type: "email_received",
      detail: { destination_purpose: destination.purpose, provider: "resend" },
    });
    if (eventError) console.error("Intake audit event failed", { intakeId, code: eventError.code });
  }
  return Response.json({ accepted: true, intakeId });
});
