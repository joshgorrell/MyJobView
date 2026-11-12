// Server-only adapter for Techsafe receiver credentials stored in an Edge
// Function secret. Never import from browser code or log the secret value.
// TECHSAFE_RECEIVER_CREDENTIALS is a JSON array of per-connection records:
// {connectionId, organizationId, generation, endpoint, token}.
// The token is NOT the SHA-256 digest configured at Techsafe.
const uuid = v => typeof v === 'string' &&
 /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
export function createTechsafeEnvironmentSecretReader({getEnv}={}) {
 if(typeof getEnv!=='function')throw new TypeError('server_environment_required');
 return async ({connectionId,organizationId,generation}={})=>{
  if(!uuid(connectionId)||!uuid(organizationId)||
   !Number.isSafeInteger(generation)||generation<1)return null;
  let records;
  try {
   const raw=getEnv('TECHSAFE_RECEIVER_CREDENTIALS');
   if(typeof raw!=='string'||raw.length>65536)return null;
   records=JSON.parse(raw);
  } catch {return null;}
  if(!Array.isArray(records)||records.length===0||records.length>100)return null;
  // Reject ambiguous or malformed secret configuration rather than choosing
  // an arbitrary entry. Never echo the JSON, token, or parse error.
  const seen=new Set();
  for(const record of records){
   if(!record||typeof record!=='object'||Array.isArray(record)||
    !uuid(record.connectionId)||!uuid(record.organizationId)||
    !Number.isSafeInteger(record.generation)||record.generation<1||
    typeof record.endpoint!=='string'||typeof record.token!=='string')
    return null;
   const key=record.connectionId+':'+record.generation;
   if(seen.has(key))return null;
   seen.add(key);
  }
  const found=records.filter(r=>r.connectionId===connectionId&&
   r.organizationId===organizationId&&r.generation===generation);
  return found.length===1?found[0]:null;
 };
}

/** Deno Edge Function entrypoints can use this factory without passing
 * credentials through requests. No environment access occurs at import time. */
export function createDenoTechsafeSecretReader() {
 return createTechsafeEnvironmentSecretReader({
  getEnv:name=>{
   if(typeof Deno==='undefined'||typeof Deno.env?.get!=='function')return undefined;
   return Deno.env.get(name);
  },
 });
}
