// Only called after a verified visitor session successfully sends a message.
// Claim durable notification IDs before sending to prevent duplicate pushes on retries.
export async function dispatchWebsiteChatPush(db:any,org:string,conversation:string){
 const {data:recipients,error}=await db.rpc("claim_website_chat_push",{p_org:org,p_conversation:conversation});
 if(error)throw error;
 const ids=[...new Set((recipients??[]).map((r:{user_id:string})=>r.user_id))];
 if(!ids.length)return;
 const {data:tokens,error:tokenError}=await db.from("push_tokens").select("token").eq("organization_id",org).in("user_id",ids).eq("is_active",true).eq("notifications_enabled",true);
 if(tokenError)throw tokenError;
 const unique=[...new Set((tokens??[]).map((r:{token:string})=>r.token))].filter(t=>typeof t==="string"&&/^(Expo|Exponent)PushToken\[.+\]$/.test(t));
 for(let i=0;i<unique.length;i+=100){
 const response=await fetch("https://exp.host/--/api/v2/push/send",{method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(10000),body:JSON.stringify(unique.slice(i,i+100).map(to=>({to,title:"New website chat",body:"A website visitor is waiting for a reply.",data:{type:"website_chat",conversationId:conversation},sound:"default",channelId:"default"})))});
 if(!response.ok)throw Error("Push gateway unavailable");
 const result=await response.json();if(!Array.isArray(result.data)||result.data.some((ticket:{status:string})=>ticket.status!=="ok"))console.error("Website chat push ticket not accepted");
 }
}
