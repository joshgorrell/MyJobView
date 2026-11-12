// Server-only adapter between MJV's certified dispatch and Techsafe's HTTP receiver.
// Connection credentials are supplied by trusted server storage, never source rows.
import {sendTechsafeDraft} from './techsafe-draft-http-transport.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const held=reason=>({accepted:false,materialized:false,reason});
export function createTechsafeReceiverDelivery({readCredentials,fetchImpl}={}){
 if(typeof readCredentials!=='function')throw new TypeError('private_credential_reader_required');
 return async ({binding,sourceRevision,content,connection}={})=>{
  if(!object(binding)||!object(connection)||connection.enabled!==true||
     connection.status!=='active'||connection.connectionId!==binding.connectionId||
     connection.organizationId!==binding.organizationId||
     connection.orderId!==binding.orderId||connection.proposalId!==binding.proposalId||
     !Number.isSafeInteger(connection.generation)||connection.generation<1||
     content?.generation!==connection.generation)
   return held('connection_or_generation_unverified');
  // Credentials must come from private server storage, not the bundle or
  // connection object. Do not log tokens or include them in receipts.
  let credentials;
  try{credentials=await readCredentials({connectionId:binding.connectionId,
    organizationId:binding.organizationId,generation:connection.generation});}
  catch{return held('credentials_unavailable');}
  if(!object(credentials)||credentials.connectionId!==binding.connectionId||
     credentials.organizationId!==binding.organizationId||
     credentials.generation!==connection.generation||
     typeof credentials.endpoint!=='string'||typeof credentials.token!=='string')
   return held('credentials_unavailable');
  return sendTechsafeDraft({endpoint:credentials.endpoint,token:credentials.token,
   binding,sourceRevision,content,...(fetchImpl?{fetchImpl}:{})});
 };
}
