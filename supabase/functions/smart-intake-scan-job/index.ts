import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { scanPendingAttachment } from "../smart-intake-email/attachment-scan-worker.ts";

// Private job endpoint. Caller must present a dedicated secret; never expose
// the service-role key or scanner token to the browser.
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const secret = Deno.env.get("SMART_INTAKE_SCAN_JOB_SECRET");
  const provided = request.headers.get("x-smart-intake-job-secret");
  if (!secret || secret.length < 32 || !provided || provided.length !== secret.length) {
    return new Response(null, { status: 401 });
  }
  const a = new TextEncoder().encode(secret);
  const b = new TextEncoder().encode(provided);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference !== 0) return new Response(null, { status: 401 });
  if (Deno.env.get("SMART_INTAKE_SCAN_ENABLED") !== "true") {
    return Response.json({ error: "Scanning disabled" }, { status: 503 });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return Response.json({ error: "Missing service configuration" }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("intake_attachments")
    .select("id,storage_key,sha256,byte_size,scan_status,intake_messages!inner(intake_items!inner(organization_id))")
    .eq("scan_status", "pending").is("deleted_at", null).order("created_at", { ascending: true }).limit(10);
  if (error) return Response.json({ error: "Unable to retrieve pending attachments" }, { status: 503 });
  let scanned = 0;
  let failed = 0;
  for (const item of data ?? []) {
    const message = item.intake_messages as unknown as { intake_items?: { organization_id?: string } };
    const organizationId = message?.intake_items?.organization_id;
    if (!organizationId) { failed++; continue; }
    try {
      await scanPendingAttachment(db as never, {
        id: item.id,
        storage_key: item.storage_key,
        sha256: item.sha256,
        byte_size: item.byte_size,
        scan_status: "pending",
        organization_id: organizationId,
      }, {
        endpoint: Deno.env.get("SMART_INTAKE_SCANNER_ENDPOINT"),
        token: Deno.env.get("SMART_INTAKE_SCANNER_TOKEN"),
        allowedHost: Deno.env.get("SMART_INTAKE_SCANNER_HOST"),
      });
      scanned++;
    } catch (cause) {
      console.error("Smart Intake scan attempt failed", { attachmentId: item.id, reason: cause instanceof Error ? cause.message : "unknown" });
      failed++;
    }
  }
  return Response.json({ scanned, failed, inspected: data?.length ?? 0 });
});
