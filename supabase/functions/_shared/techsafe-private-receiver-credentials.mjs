// Server-only credential validation for the Techsafe receiver.
// The bearer token must come from a private secret store, never a Sales Order,
// browser request, source row, or repository configuration.
const uuid = value => typeof value === 'string' &&
 /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const held = reason => ({ok:false,reason});
const safeToken = value => typeof value === 'string' &&
 /^[A-Za-z0-9_-]{43,512}$/.test(value);

/**
 * Resolve credentials for a single already-authorized connection.
 * readSecret is a trusted server-side callback returning {endpoint,token,
 * connectionId,organizationId,generation}. Never return or log token on error.
 */
export function createPrivateTechsafeCredentialReader({readSecret}={}) {
 if(typeof readSecret !== 'function') throw new TypeError('private_secret_reader_required');
 return async ({connectionId,organizationId,generation}={}) => {
  if(!uuid(connectionId)||!uuid(organizationId)||
    !Number.isSafeInteger(generation)||generation<1)
   return held('invalid_connection_binding');
  let secret;
  try { secret=await readSecret({connectionId,organizationId,generation}); }
  catch { return held('private_credentials_unavailable'); }
  if(!secret||secret.connectionId!==connectionId||
   secret.organizationId!==organizationId||secret.generation!==generation||
   !safeToken(secret.token)||typeof secret.endpoint!=='string')
   return held('private_credentials_unavailable');
  let url;
  try { url=new URL(secret.endpoint); }
  catch { return held('private_credentials_unavailable'); }
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
   url.hostname!=='ywvrmjfhixgzdyfuhdpv.supabase.co'||url.port!==''||url.pathname!=='/functions/v1/mjv-import')
   return held('private_credentials_unavailable');
  return {ok:true,connectionId,organizationId,generation,
   endpoint:url.href,token:secret.token};
 };
}
