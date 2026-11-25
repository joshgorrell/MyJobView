import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {hashVisitorToken,newVisitorToken,validateChatMessage,validateChatOrigin} from "../_shared/website-chat-session.ts";
Deno.serve(async req=>{
 let origin="",allowed=false;
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin",...(allowed?{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"}:{})}});
 try{
 origin=validateChatOrigin(req.headers.get("Origin")??"");
 const id=new URL(req.url).searchParams.get("id")??"";
 if(!/^[0-9a-f-]{36}$/i.test(id))return reply(404,{error:"Unavailable"});
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const {data:w,error}=await db.from("website_widget_settings").select("id,organization_id,enabled,allowed_origins").eq("public_id",id).eq("kind","chat").maybeSingle();
 if(error||!w?.enabled||!w.allowed_origins.includes(origin))return reply(404,{error:"Unavailable"});
 allowed=true;
 if(req.method==="OPTIONS")return reply(200,{});
 if(req.method!=="POST")return reply(405,{error:"Method not allowed"});

 const reader=req.body?.getReader();if(!reader)return reply(400,{error:"Missing request"});
 const decoder=new TextDecoder();let raw="",size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return reply(413,{error:"Too large"});}raw+=decoder.decode(value,{stream:true});}
 const body=JSON.parse(raw+decoder.decode());
 if(body.action==="start"){
 const {data:permit,error:limitError}=await db.rpc("consume_website_widget_limit",{p_widget:id});
 if(limitError||!permit)return reply(limitError?503:429,{error:"Try again later"});
 const secret=Deno.env.get("WEBSITE_TURNSTILE_SECRET");
 if(!secret||typeof body.botToken!=="string"||body.botToken.length>2048)return reply(400,{error:"Verification required"});
 const verification=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:new URLSearchParams({secret,response:body.botToken}),signal:AbortSignal.timeout(8000)});
 if(!verification.ok)return reply(503,{error:"Verification unavailable"});
 const proof=await verification.json();if(!proof.success||proof.hostname!==new URL(origin).hostname||proof.action!=="website_chat")return reply(400,{error:"Verification failed"});
 const token=newVisitorToken();
 const {error}=await db.from("website_chat_conversations").insert({widget_id:w.id,organization_id:w.organization_id,origin,visitor_token_hash:await hashVisitorToken(token)});
 if(error)return reply(503,{error:"Unable to start chat"});
 return reply(200,{token});
 }
 const hash=await hashVisitorToken(body.token);
 const {data:conversation,error:sessionError}=await db.from("website_chat_conversations").select("id,status").eq("visitor_token_hash",hash).eq("widget_id",w.id).eq("organization_id",w.organization_id).eq("origin",origin).maybeSingle();
 if(sessionError||!conversation)return reply(404,{error:"Session unavailable"});
 const {data:permit,error:limitError}=await db.rpc("consume_website_chat_session_limit",{p_conversation:conversation.id});
 if(limitError||!permit)return reply(limitError?503:429,{error:"Try again later"});
 if(body.action==="send"){
 if(conversation.status!=="open")return reply(409,{error:"Conversation closed"});
 const message=validateChatMessage(body);
 const {error}=await db.from("website_chat_messages").upsert({conversation_id:conversation.id,organization_id:w.organization_id,request_id:message.requestId,sender:"visitor",body:message.body},{onConflict:"conversation_id,request_id",ignoreDuplicates:true});
 if(error)return reply(503,{error:"Unable to send"});
 return reply(200,{success:true});
 }
 if(body.action==="read"){
 const {data,error}=await db.from("website_chat_messages").select("id,sender,body,created_at").eq("conversation_id",conversation.id).eq("organization_id",w.organization_id).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(100);
 if(error)return reply(503,{error:"Unable to read"});
 return reply(200,{status:conversation.status,messages:(data??[]).reverse()});
 }
 return reply(400,{error:"Invalid action"});
 }catch{return reply(400,{error:"Invalid request"});}
});
