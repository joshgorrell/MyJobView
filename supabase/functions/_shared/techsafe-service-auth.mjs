// Internal server-to-server invocation uses the EXISTING project service key.
// Never infer service authority by decoding a caller's JWT role claim.
export function createTechsafeServiceAuthenticator(serviceKey){
 return async authorization=>{
  if(typeof serviceKey!=='string'||serviceKey.length<32||typeof authorization!=='string'||
     !authorization.startsWith('Bearer ')||authorization.length>8192)return false;
  const encoder=new TextEncoder();
  const [expected,actual]=await Promise.all([
   crypto.subtle.digest('SHA-256',encoder.encode(serviceKey)),
   crypto.subtle.digest('SHA-256',encoder.encode(authorization.slice(7)))]);
  const a=new Uint8Array(expected),b=new Uint8Array(actual);let difference=0;
  for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
  return difference===0;
 };
}
