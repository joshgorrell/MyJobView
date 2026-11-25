import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const kinds = new Set(["sales-lead", "chat", "service", "feedback", "portal", "analytics"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(status: number, body: unknown, origin?: string) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
  } });
}
Deno.serve(async (req: Request) => {
  // GET is a simple CORS request; no credentials or custom headers are needed.
  if (req.method !== "GET") return reply(405, { error: "Method not allowed" });
  const origin = req.headers.get("Origin");
  try {
    if (!origin || new URL(origin).origin !== origin || !origin.startsWith("https://")) return reply(404, { error: "Unavailable" });
    const url = new URL(req.url);
    const id = url.searchParams.get("id") ?? "";
    const kind = url.searchParams.get("kind") ?? "";
    if (!uuid.test(id) || !kinds.has(kind)) return reply(404, { error: "Unavailable" });
    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.from("website_widget_settings").select("enabled,allowed_origins,branding,options").eq("public_id", id).eq("kind", kind).maybeSingle();
    if (error || !data?.enabled || !Array.isArray(data.allowed_origins) || !data.allowed_origins.includes(origin)) return reply(404, { error: "Unavailable" });
    const branding = data.branding ?? {};
    const options = data.options ?? {};
    const siteKey = Deno.env.get("WEBSITE_TURNSTILE_SITE_KEY") ?? "";
    if (kind === "sales-lead" && (!siteKey || !Deno.env.get("WEBSITE_TURNSTILE_SECRET"))) return reply(503, { error: "Unavailable" }, origin);
    const interests = Array.isArray(options.interests) ? [...new Set(options.interests.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 100).map((v: string) => v.trim()))].slice(0, 30) : [];
    let portalUrl: string | undefined;
    if (kind === "portal") {
      const base = Deno.env.get("WEBSITE_PORTAL_ORIGIN") ?? "";
      const candidate = new URL(typeof options.portal_url === "string" ? options.portal_url : "");
      if (!base || candidate.protocol !== "https:" || candidate.origin !== new URL(base).origin || candidate.username || candidate.password || candidate.search || candidate.hash) return reply(503, { error: "Unavailable" }, origin);
      portalUrl = candidate.href;
    }
    return reply(200, { kind, ...(portalUrl ? { portalUrl } : {}), ...(kind === "sales-lead" ? { turnstileSiteKey: siteKey, interests } : {}), branding: {
      name: typeof branding.name === "string" ? branding.name.slice(0, 100) : "",
      color: typeof branding.color === "string" && /^#[0-9a-f]{6}$/i.test(branding.color) ? branding.color : "#2563eb",
    } }, origin);
  } catch { return reply(404, { error: "Unavailable" }); }
});
