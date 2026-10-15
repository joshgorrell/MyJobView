import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Staged only: requires an explicit deployment and SMART_INTAKE_ROUTING_ENABLED=true.
// No scheduled invocation or public user-triggered routing is configured.
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (Deno.env.get("SMART_INTAKE_ROUTING_ENABLED") !== "true") {
    return new Response("Routing disabled", { status: 503 });
  }
  const token = Deno.env.get("SMART_INTAKE_ROUTING_WORKER_TOKEN");
  const supplied = request.headers.get("x-routing-worker-token");
  if (!token || !supplied || token.length < 32 || supplied !== token) {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response("Worker not configured", { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const intakeId = (body && typeof body === "object" && "intake_id" in body)
    ? (body as { intake_id: unknown }).intake_id : null;
  if (typeof intakeId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intakeId)) {
    return new Response("Invalid intake_id", { status: 400 });
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: claim, error: claimError } = await db.from("intake_routing_claims")
    .select("state").eq("intake_id", intakeId).maybeSingle();
  if (claimError) return new Response("Unable to check claim", { status: 500 });
  if (!claim) return new Response("Intake not queued", { status: 409 });
  const { data: item, error: itemError } = await db.from("intake_items")
    .select("classification").eq("id", intakeId).maybeSingle();
  if (itemError) return new Response("Unable to check intake", { status: 500 });
  if (!item || item.classification !== "service") {
    return new Response("Unsupported intake destination", { status: 409 });
  }
  const { data, error } = await db.rpc("smart_intake_route_service", { target_intake: intakeId });
  if (error) {
    console.error("Smart Intake service routing failed", { intakeId, code: error.code });
    return new Response("Service routing failed; intake remains queued for review", { status: 409 });
  }
  return Response.json({ intake_id: intakeId, service_request_id: data });
});
