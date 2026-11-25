import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
function validateWebsiteFeedback(body: Record<string, unknown>) {
 if(!body || typeof body !== "object" || Array.isArray(body)) throw Error("Invalid feedback");
 const {rating,requestId}=body;
 if(typeof rating!=="string" || !["excellent","good","okay","needs_attention"].includes(rating) || typeof requestId!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw Error("Invalid feedback");
 function optional(key:string,max:number){const v=body[key]??"";if(typeof v!=="string"||v.length>max)throw Error("Invalid feedback");return v.trim();}
 const name=optional("name",120),email=optional("email",254),comment=optional("comment",5000);
 if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("Invalid email");
 return {rating,requestId,name,email,comment};
}
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "";
  const reply = (status: number, body: unknown, allowed = false) => new Response(JSON.stringify(body), {status, headers: {"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin", ...(allowed ? {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"} : {})}});
  try {
    if (!origin.startsWith("https://") || new URL(origin).origin !== origin) return reply(404,{error:"Unavailable"});
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return reply(404,{error:"Unavailable"});
    const db = createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const {data:w,error} = await db.from("website_widget_settings").select("enabled,allowed_origins").eq("public_id",id).eq("kind","feedback").maybeSingle();
    if(error || !w?.enabled || !w.allowed_origins.includes(origin)) return reply(404,{error:"Unavailable"});
    if(req.method === "OPTIONS") return reply(200,{},true);
    if(req.method !== "POST") return reply(405,{error:"Method not allowed"},true);
    const secret = Deno.env.get("WEBSITE_TURNSTILE_SECRET");
    if (!secret) return reply(503,{error:"Website intake is not yet available"},true);
    const {data: permitted,error: limitError} = await db.rpc("consume_website_widget_limit",{p_widget:id});
    if(limitError) return reply(503,{error:"Temporarily unavailable"},true);
    if(!permitted) return reply(429,{error:"Please try again later"},true);
    const reader = req.body?.getReader();
    if(!reader) return reply(400,{error:"Missing submission"},true);
    const decoder = new TextDecoder();
    let raw = "", bytes = 0;
    while(true) {
      const {done,value} = await reader.read();
      if(done) break;
      bytes += value.byteLength;
      if(bytes > 16384) { await reader.cancel(); return reply(413,{error:"Submission too large"},true); }
      raw += decoder.decode(value,{stream:true});
    }
    const body = JSON.parse(raw + decoder.decode());
    const lead = validateWebsiteFeedback(body);
    if(typeof body.botToken !== "string" || body.botToken.length > 2048 || !body.botToken) return reply(400,{error:"Verification required"},true);
    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:new URLSearchParams({secret,response:body.botToken}),signal:AbortSignal.timeout(8000)});
    if(!verification.ok) return reply(503,{error:"Verification unavailable"},true);
    const proof = await verification.json();
    if(!proof.success || proof.hostname !== new URL(origin).hostname || proof.action !== "website_feedback") return reply(400,{error:"Verification failed"},true);
    const {error: intakeError} = await db.rpc("create_website_feedback",{p_widget:id,p_origin:origin,p_request:lead.requestId,p_name:lead.name,p_email:lead.email,p_rating:lead.rating,p_comment:lead.comment});
    if(intakeError) return reply(503,{error:"Unable to submit. Please retry."},true);
    return reply(200,{success:true},true);
  } catch { return reply(400,{error:"Invalid request"}); }
});
