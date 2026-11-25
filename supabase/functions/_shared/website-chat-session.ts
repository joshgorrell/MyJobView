const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function hashVisitorToken(token:string) {
 if(!/^[0-9a-f]{64}$/.test(token)) throw Error("Invalid session");
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
export function newVisitorToken(){
 return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
}
export function validateChatMessage(input:unknown){
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Invalid message");
 const {requestId,body}=input as Record<string,unknown>;
 if(typeof requestId!=="string"||!uuid.test(requestId)||typeof body!=="string"||!body.trim()||body.length>4000)throw Error("Invalid message");
 return {requestId,body:body.trim()};
}
export function validateChatOrigin(origin:string){
 const u=new URL(origin);
 if(u.protocol!=="https:"||u.origin!==origin||u.username||u.password)throw Error("Invalid origin");
 return origin;
}
