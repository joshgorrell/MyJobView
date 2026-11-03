import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Apikey",
};

const ratings = new Set(["excellent","good","okay","needs_attention"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const { token, rating, comment } = await req.json();
    if (!token || !ratings.has(rating)) return new Response(JSON.stringify({ error: "Invalid feedback" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const { data: record, error } = await db.from("customer_satisfaction")
      .select("id,rating,responded_at,organization_id")
      .eq("response_token", token).maybeSingle();
    if (error || !record) return new Response(JSON.stringify({ error: "Feedback link not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const patch: Record<string, unknown> = { rating, responded_at: record.responded_at || new Date().toISOString() };
    if (typeof comment === "string" && comment.trim()) patch.comment = comment.trim().slice(0, 5000);
    const updated = await db.from("customer_satisfaction").update(patch).eq("id", record.id);
    if (updated.error) throw updated.error;

    const [{ data: settings }, { data: organization }] = await Promise.all([
      db.from("company_settings").select("company_name,company_logo_url,company_email").eq("organization_id", record.organization_id).maybeSingle(),
      db.from("organizations").select("subdomain").eq("id", record.organization_id).maybeSingle(),
    ]);
    const company = {
      name: settings?.company_name || "Our team", logoUrl: settings?.company_logo_url || "", email: settings?.company_email || "",
      reviewUrl: organization?.subdomain === "elife" ? "https://g.page/r/CZzvVUth7kuyEBM/review" : null,
    };
    return new Response(JSON.stringify({ success: true, rating, company }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unable to save feedback" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
