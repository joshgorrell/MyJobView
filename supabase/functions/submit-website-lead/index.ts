import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { validateWebsiteLead } from "../_shared/website-lead-validation.ts";
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "";
  const reply = (status: number, body: unknown, allowed = false) => new Response(JSON.stringify(body), {status, headers: {"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin", ...(allowed ? {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"} : {})}});
  try {
    if (!origin.startsWith("https://") || new URL(origin).origin !== origin) return reply(404,{error:"Unavailable"});
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return reply(404,{error:"Unavailable"});
    const db = createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const {data:w,error} = await db.from("website_widget_settings").select("enabled,allowed_origins").eq("public_id",id).eq("kind","sales-lead").maybeSingle();
    if(error || !w?.enabled || !w.allowed_origins.includes(origin)) return reply(404,{error:"Unavailable"});
    if(req.method === "OPTIONS") return reply(200,{},true);
    if(req.method !== "POST") return reply(405,{error:"Method not allowed"},true);
    // Fail closed until durable rate limiting and bot verification are installed.
    return reply(503,{error:"Website intake is not yet available"},true);
  } catch { return reply(400,{error:"Invalid request"}); }
});
