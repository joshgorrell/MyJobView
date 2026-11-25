import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { notifyWebsiteLead } from "../_shared/website-lead-notify.ts";
import { validateWebsiteLead } from "../_shared/website-lead-validation.ts";
Deno.serve(async (req) => {
 if(Deno.env.get("WEBSITE_WIDGET_RUNTIME_ENABLED")!=="true")return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});

  const origin = req.headers.get("Origin") ?? "";
  const reply = (status: number, body: unknown, allowed = false) => new Response(JSON.stringify(body), {status, headers: {"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin", ...(allowed ? {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"} : {})}});
  let originApproved = false;
  try {
    if (!origin.startsWith("https://") || new URL(origin).origin !== origin) return reply(404,{error:"Unavailable"});
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return reply(404,{error:"Unavailable"});
    const db = createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const {data:w,error} = await db.from("website_widget_settings").select("enabled,allowed_origins").eq("public_id",id).eq("kind","sales-lead").maybeSingle();
    if(error || !w?.enabled || !w.allowed_origins.includes(origin)) return reply(404,{error:"Unavailable"});
    originApproved = true;
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
    const lead = validateWebsiteLead(body);
    if(typeof body.botToken !== "string" || body.botToken.length > 2048 || !body.botToken) return reply(400,{error:"Verification required"},true);
    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:new URLSearchParams({secret,response:body.botToken}),signal:AbortSignal.timeout(8000)});
    if(!verification.ok) return reply(503,{error:"Verification unavailable"},true);
    const proof = await verification.json();
    if(!proof.success || proof.hostname !== new URL(origin).hostname || proof.action !== "website_lead") return reply(400,{error:"Verification failed"},true);
    const description = ["Project: "+lead.projectType,"ZIP: "+lead.zip,"Timeline: "+lead.timeline,"Budget: "+lead.budget,"Interests: "+lead.interests.join(", "),lead.description,"Website: "+origin,"Contact consent: granted"].join("\n");
    const {data: leadId,error: intakeError} = await db.rpc("create_website_lead",{p_widget:id,p_origin:origin,p_request:lead.requestId,p_name:lead.name,p_email:lead.email,p_phone:lead.phone,p_description:description});
    if(intakeError) return reply(503,{error:"Unable to submit. Please retry."},true);
    if(typeof leadId === "string") EdgeRuntime.waitUntil(notifyWebsiteLead(db,leadId).catch(()=>console.error("Website lead notification processing failed")));
    return reply(200,{success:true},true);
  } catch { return reply(400,{error:"Invalid request"},originApproved); }
});
