import {paymentsOrigin} from './security-payment-vault.ts';

export interface ChargeOutcome {state:'paid'|'pending'|'declined'|'unknown';processor_id?:string;processor_status?:string;message?:string}
export function classifySecurityCharge(raw:Record<string,unknown>,type:'card'|'ach',settledAchStatus:string):ChargeOutcome {
  const id=String(raw.id||'');const status=String(raw.status||'').toUpperCase();
  if(!id) return {state:'unknown',message:'Provider response had no transaction ID; reconcile before retrying'};
  if(type==='card' && status==='CAPTURED' || type==='ach' && !!settledAchStatus && status===settledAchStatus.toUpperCase())
    return {state:'paid',processor_id:id,processor_status:status};
  if(['DECLINED','FAILED','RETURNED','CANCELLED','VOIDED'].includes(status)) return {state:'declined',processor_id:id,processor_status:status,message:'Payment was not completed'};
  return {state:'pending',processor_id:id,processor_status:status,message:'Awaiting confirmed payment completion'};
}

export async function securityCharge(environment:string,accessToken:string,type:'card'|'ach',methodId:string,amount:number,requestId:string,
  description:string,settledAchStatus:string,processorId?:string,fetcher:typeof fetch=fetch):Promise<ChargeOutcome> {
  const collection=type==='card'?'charges':'echecks';
  const path=paymentsOrigin(environment)+'/quickbooks/v4/payments/'+collection+(processorId?'/'+encodeURIComponent(processorId):'');
  const body=type==='card'?{amount:amount.toFixed(2),currency:'USD',capture:true,cardOnFile:methodId,description,context:{mobile:false,isEcommerce:true}}
    :{amount:amount.toFixed(2),bankAccountOnFile:methodId,paymentMode:'WEB',description,context:{mobile:false,isEcommerce:true}};
  try {
    const response=await fetcher(path,{method:processorId?'GET':'POST',headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json','Content-Type':'application/json','Request-Id':requestId},
      body:processorId?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    if(!response.ok) return {state:'unknown',processor_id:processorId,message:`QuickBooks returned HTTP ${response.status}; reconcile before retrying`};
    const raw=await response.json();
    if(processorId && String(raw.id)!==processorId) return {state:'unknown',processor_id:processorId,message:'Provider transaction did not match the requested ID'};
    if(Math.round(Number(raw.amount)*100)!==Math.round(amount*100)) return {state:'unknown',processor_id:String(raw.id||processorId||''),message:'Provider amount differs from the invoice; reconciliation required'};
    return classifySecurityCharge(raw,type,settledAchStatus);
  } catch {
    // A timeout cannot establish whether a POST charged the customer. Never retry it.
    return {state:'unknown',processor_id:processorId,message:'Payment response was unavailable; reconcile before retrying'};
  }
}
