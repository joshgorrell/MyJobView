export interface PaymentAlertEmail {
 id:string;lease_token:string;audience:'customer'|'staff';reminder:number;kind:string;title:string;detail:string;
 contract_id:string;contract_number:string;to:string|null;from_email:string|null;company_name:string|null;from_name:string|null;support_email:string|null;subdomain:string|null;
 frozen_message?:ReturnType<typeof paymentAlertMessage>|null;
}
export function paymentAlertMessage(a:PaymentAlertEmail) {
 const name=(a.from_name||a.company_name||'Your monitoring provider').replace(/[\r\n<>]/g,'');
 const domain=a.subdomain && /^[a-z0-9-]+$/i.test(a.subdomain)?`${a.subdomain}.`:'';
 return {from:`${name} <${a.from_email}>`,to:[a.to],subject:`${a.reminder?'Reminder: ':''}${a.title} — ${a.contract_number}`,
 text:`${a.detail}\n\nAgreement: ${a.contract_number}\n${a.audience==='customer'?`Review your agreement and invoices: https://${domain}myjobview.com/portal/security?contract=${encodeURIComponent(a.contract_id)}\nContact: ${a.support_email||'your monitoring provider'}`:'Open MyJobView → Contract Management → Payment alerts to review the agreement and delivery history.'}`};
}
export function validatePaymentAlertMessage(message:ReturnType<typeof paymentAlertMessage>) {
 const email=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;const sender=message.from.match(/<([^<>]+)>$/)?.[1];
 if(message.to.length!==1 || !email.test(message.to[0]||'') || !email.test(sender||''))throw new Error('Configure a valid alert recipient and sender');
}
export async function sendPaymentAlert(a:PaymentAlertEmail,key:string|undefined,fetcher:typeof fetch=fetch,message=paymentAlertMessage(a)):Promise<string> {
 validatePaymentAlertMessage(message);if(!key)throw new Error('Configure the email service');
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`security-payment-alert-${a.id}`},body:JSON.stringify(message),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Email service did not accept the alert (HTTP ${response.status})`);
 const result=await response.json();if(typeof result.id!=='string'||!result.id)throw new Error('Email service acceptance could not be confirmed');return result.id;
}
