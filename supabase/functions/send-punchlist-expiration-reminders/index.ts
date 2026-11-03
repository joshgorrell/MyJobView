import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Safe dry-run worker. It does not send emails or write customer data.
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("PUNCHLIST_REMINDER_JOB_SECRET");
  if (!secret || request.headers.get("x-punchlist-job-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.rpc("get_punchlist_expiration_reminder_candidates");
  if (error) return Response.json({ error: "Reminder preview failed" }, { status: 500 });
  const counts: Record<string, number> = {};
  for (const item of data ?? []) {
    const key = String(item.reminder_kind) + ":" + String(item.reminder_stage);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Response.json({ mode: "dry_run", eligible: data?.length ?? 0, counts, emails_sent: 0 });
});
