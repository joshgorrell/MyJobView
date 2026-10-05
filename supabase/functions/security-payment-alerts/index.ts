import {getSupabaseAdmin} from '../_shared/qbo-client.ts';
import {authorizeSecurityWorker} from '../_shared/security-worker-auth.ts';
import {sendPaymentAlert,paymentAlertMessage,validatePaymentAlertMessage,type PaymentAlertEmail} from '../_shared/security-payment-alert-email.ts';
Deno.serve(async(req:Request)=>{
 const admin=getSupabaseAdmin();
 if(!await authorizeSecurityWorker(req,Deno.env.get('SECURITY_BILLING_CRON_SECRET'),async token=>{const {data,error}=await admin.rpc('security_billing_worker_authorized',{p_secret:token});return !error && data===true;}))return json({error:'Unauthorized'},401);
 const rpc=async(action:string,d?:PaymentAlertEmail,payload:Record<string,unknown>={})=>{const {data,error}=await admin.rpc('security_payment_alert_worker',{p_action:action,p_id:d?.id||null,p_token:d?.lease_token||null,p_payload:payload});if(error)throw new Error('Payment alert queue needs review');return data;};
 let sent=0,failed=0;const started=Date.now();
 try {
  await rpc('scan');
  while(sent+failed<20 && Date.now()-started<40000){
   const d=await rpc('lease') as PaymentAlertEmail|null;if(!d)break;
   try {const message=d.frozen_message||paymentAlertMessage(d);validatePaymentAlertMessage(message);const frozen=await rpc('message',d,message);const providerId=await sendPaymentAlert(d,Deno.env.get('RESEND_API_KEY'),fetch,frozen);await rpc('sent',d,{provider_id:providerId});sent++;}
   catch(e){await rpc('failed',d,{message:e instanceof Error?e.message:'Email delivery needs review'});failed++;}
  }
  return json({success:true,sent,failed});
 }catch{return json({error:'Payment alert scan or queue could not complete'},500);}
});
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
