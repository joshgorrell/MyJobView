import {getSupabaseAdmin,getConnection,getValidAccessToken} from '../_shared/qbo-client.ts';
import {authorizeSecurityWorker} from '../_shared/security-worker-auth.ts';
import {securityCharge,type ChargeOutcome} from '../_shared/security-charge.ts';
interface Observation {id:string;organization_id:string;processor_id:string;amount:number;lease_token:string}
Deno.serve(async(req:Request)=>{
 const admin=getSupabaseAdmin();
 if(!await authorizeSecurityWorker(req,Deno.env.get('SECURITY_BILLING_CRON_SECRET'),async token=>{const {data,error}=await admin.rpc('security_billing_worker_authorized',{p_secret:token});return !error&&data===true;}))return json({error:'Unauthorized'},401);
 const rpc=async(action:string,o?:Observation,payload:Record<string,unknown>={})=>{const {data,error}=await admin.rpc('security_payment_alert_worker',{p_action:action,p_id:o?.id||null,p_token:o?.lease_token||null,p_payload:payload});if(error)throw new Error('Settlement watch needs review');return data;};
 let checked=0;const started=Date.now();
 try {
  while(checked<5&&Date.now()-started<35000){
   const o=await rpc('settlement_lease') as Observation|null;if(!o)break;
   let outcome:ChargeOutcome={state:'unknown'};
   try {const connection=await getConnection(admin,o.organization_id);const token=connection&&await getValidAccessToken(admin,connection);const settled=Deno.env.get('SECURITY_ACH_SETTLED_STATUS');
    if(connection&&token&&settled&&o.processor_id)outcome=await securityCharge(connection.environment,token,'ach','',Number(o.amount),crypto.randomUUID(),'Verify previously received monitoring payment',settled,o.processor_id);
   }catch{/* Record an uncertain observation; never retry a debit. */}
   await rpc('settlement_result',o,{state:outcome.state});checked++;
  }
  await rpc('scan');return json({success:true,checked});
 }catch{return json({error:'Settlement watch could not complete'},500);}
});
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
