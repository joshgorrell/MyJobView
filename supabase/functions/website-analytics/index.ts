import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
Deno.serve(async req=>{
 if(Deno.env.get("WEBSITE_WIDGET_RUNTIME_ENABLED")!=="true")return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});

 const origin=req.headers.get("Origin")??"";
 const reply=(status:number,allowed=false)=>new Response(null,{status,headers:{"Cache-Control":"no-store","Vary":"Origin",...(allowed?{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS"}:{})}});
 try{
 if(!origin.startsWith("https://")||new URL(origin).origin!==origin)return reply(404);
 const url=new URL(req.url),id=url.searchParams.get("id")??"";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return reply(404);
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:w,error}=await db.from("website_widget_settings").select("enabled,allowed_origins").eq("public_id",id).eq("kind","analytics").maybeSingle();
 if(error||!w?.enabled||!w.allowed_origins.includes(origin))return reply(404);
 if(req.method==="OPTIONS")return reply(204,true);
 if(req.method!=="POST")return reply(405,true);
 const {data:permit,error:limit}=await db.rpc("consume_website_widget_limit",{p_widget:id});
 if(limit||!permit)return reply(429,true);
 // Only aggregate total page views until dealer-approved public path mapping exists.
 const {data,error:write}=await db.rpc("record_website_view",{p_public_id:id,p_origin:origin,p_path:"/"});
 return reply(write||!data?503:204,true);
 }catch{return reply(400);}
});
