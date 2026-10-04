import {resolveSecurityInvoiceItems} from '../_shared/security-invoice-items.ts';
import {getSupabaseAdmin,getConnection,getValidAccessToken,qboRequest,upsertEntityMapping} from '../_shared/qbo-client.ts';
import {authorizeSecurityWorker} from '../_shared/security-worker-auth.ts';
import {securityCharge} from '../_shared/security-charge.ts';

interface Cycle {id:string;contract_id:string;organization_id:string;invoice_id:string;billing_mode:string;state:string;lease_token:string;amount:number;processor_id:string|null;request_id:string|null}

Deno.serve(async(req:Request)=>{
  const secret=Deno.env.get('SECURITY_BILLING_CRON_SECRET');
  const admin=getSupabaseAdmin();
  const authorized=await authorizeSecurityWorker(req,secret,async(token)=>{
    const {data,error}=await admin.rpc('security_billing_worker_authorized',{p_secret:token});
    return !error && data===true;
  });
  if(!authorized) return json({error:'Unauthorized'},401);
  const rpc=async(action:string,cycle?:Cycle,payload:Record<string,unknown>={})=>{
    const {data,error}=await admin.rpc('security_recurring_billing',{p_action:action,p_id:cycle?.id||null,p_payload:{...payload,lease_token:cycle?.lease_token}});
    if(error) throw new Error(error.message);return data;
  };
  let processed=0;const started=Date.now();
  try {
    await rpc('generate');
    while(processed<20 && Date.now()-started<45000) {
      const cycle=await rpc('lease') as Cycle|null;if(!cycle) break;
      processed++;
      try {
        if(cycle.state==='preparing'){await rpc('prepare',cycle);continue;}
        const {data:contract}=await admin.from('security_contracts').select('contact_id,email_override,security_payment_method_id,contract_number').eq('id',cycle.contract_id).single();
        const {data:invoice}=await admin.from('invoices').select('*,invoice_line_items(*)').eq('id',cycle.invoice_id).eq('organization_id',cycle.organization_id).single();
        const {data:contact}=await admin.from('contacts').select('qbo_customer_id,email,full_name').eq('id',contract?.contact_id).eq('organization_id',cycle.organization_id).single();
        const {data:settings}=await admin.from('company_settings').select('company_name,company_email,from_email,from_name').eq('organization_id',cycle.organization_id).single();
        const {data:org}=await admin.from('organizations').select('subdomain').eq('id',cycle.organization_id).single();
        const connection=await getConnection(admin,cycle.organization_id);
        if(!contract || !invoice || !contact?.qbo_customer_id || (!connection?.payments_enabled && cycle.billing_mode!=='mail') || !connection.security_monitoring_item_id)
          throw new Error('Configure QuickBooks Payments, the monitoring sales item, and the customer mapping before billing');
        const accessToken=await getValidAccessToken(admin,connection);if(!accessToken) throw new Error('QuickBooks credentials are unavailable');
        // Stable Accounting API requestid prevents duplicate invoices on a retry.
        if(!invoice.qbo_invoice_id) {
          const itemized=await resolveSecurityInvoiceItems(admin,connection,invoice.invoice_line_items,qboRequest);
          const response=await qboRequest(admin,connection,'POST',`invoice?requestid=sec-${cycle.id}`,{
            AllowOnlineCreditCardPayment:false,AllowOnlineACHPayment:false,CustomerRef:{value:contact.qbo_customer_id},DocNumber:invoice.invoice_number,TxnDate:invoice.invoice_date,DueDate:invoice.due_date,
            Line:itemized.map((line:Record<string,unknown>,index:number)=>({LineNum:index+1,Amount:Number(line.amount),Description:String(line.description),DetailType:'SalesItemLineDetail',
              SalesItemLineDetail:{ItemRef:{value:line.qbo_item_id},Qty:Number(line.quantity),UnitPrice:Number(line.unit_price),TaxCodeRef:{value:Number(invoice.tax_amount)>0?'TAX':'NON'}}})),
            TxnTaxDetail:{TotalTax:Number(invoice.tax_amount)},PrivateNote:`MyJobView security billing ${cycle.id}`,
          });
          const qb=response.data?.Invoice;if(!response.ok || !qb?.Id) throw new Error('QuickBooks invoice sync requires review');
          if(Math.round(Number(qb.TotalAmt)*100)!==Math.round(Number(invoice.total)*100)) throw new Error('QuickBooks and MyJobView invoice totals differ; no debit attempted');
          const {error}=await admin.from('invoices').update({qbo_invoice_id:String(qb.Id),synced_at:new Date().toISOString()}).eq('id',invoice.id);
          if(error) throw new Error('QuickBooks invoice mapping could not be saved');
          await upsertEntityMapping(admin,cycle.organization_id,'invoice',invoice.id,String(qb.Id),qb.SyncToken);
          invoice.qbo_invoice_id=String(qb.Id);
        }
        if(cycle.state==='mail') {await rpc('mail_accounting',cycle);continue;}
        if(cycle.state==='notice') {
          const debitDate=new Date(Math.max(Date.now()+10*86400000,Date.parse(`${invoice.due_date}T12:00:00-05:00`))).toLocaleDateString('en-US',{timeZone:'America/Chicago'});
          const email=contract.email_override||contact.email;
          const portal=`https://${org?.subdomain?org.subdomain+'.':''}myjobview.com/portal/security?contract=${cycle.contract_id}`;
          await sendNotice(email,settings,`Upcoming automatic payment — ${invoice.invoice_number}`,
            `Your security monitoring invoice ${invoice.invoice_number} is $${Number(cycle.amount).toFixed(2)}, including taxes shown on the invoice. MyJobView will initiate the automatic payment through QuickBooks Payments on or after ${debitDate}.\n\nReview your agreement and invoices in your customer portal: ${portal}\n\nTo change or revoke payment authorization before the scheduled debit, contact ${settings?.company_email||'your monitoring provider'}. Revoking AutoPay does not cancel your monitoring agreement or amounts owed.`, `security-notice-${cycle.id}`);
          await rpc('notice',cycle);continue;
        }
        if(cycle.state==='paid') {
          // This records a payment in Accounting; ProcessPayment=false never charges again.
          const result=await qboRequest(admin,connection,'POST',`payment?requestid=sec-pay-${cycle.id}`,{
            CustomerRef:{value:contact.qbo_customer_id},TotalAmt:Number(cycle.amount),TxnDate:new Date().toISOString().slice(0,10),PaymentRefNum:cycle.processor_id,
            ProcessPayment:false,Line:[{Amount:Number(cycle.amount),LinkedTxn:[{TxnId:invoice.qbo_invoice_id,TxnType:'Invoice'}]}],
          });
          if(!result.ok || !result.data?.Payment?.Id) throw new Error('Payment was received; QuickBooks accounting sync requires retry');
          await rpc('accounting',cycle,{qbo_payment_id:String(result.data.Payment.Id)});continue;
        }
        const {data:method}=await admin.from('security_payment_methods').select('*').eq('id',contract.security_payment_method_id).eq('contact_id',contract.contact_id).eq('organization_id',cycle.organization_id).single();
        if(!method) throw new Error('Saved payment method is unavailable');
        if(method.payment_type==='ach' && !Deno.env.get('SECURITY_ACH_SETTLED_STATUS')) throw new Error('Verify and configure the QuickBooks ACH settlement status in the merchant sandbox');
        if(cycle.state==='ready') {
          const balance=await qboRequest(admin,connection,'GET',`invoice/${invoice.qbo_invoice_id}`);
          if(!balance.ok || Math.round(Number(balance.data?.Invoice?.Balance)*100)!==Math.round(Number(cycle.amount)*100))
            throw new Error('QuickBooks invoice balance changed; reconcile before debiting');
          const claimed=await rpc('charge',cycle);if(!claimed) continue;
          const outcome=await securityCharge(connection.environment,accessToken,claimed.method.payment_type,claimed.method.qbo_method_id,Number(claimed.cycle.amount),claimed.cycle.request_id,
            `Security monitoring ${contract.contract_number}`,Deno.env.get('SECURITY_ACH_SETTLED_STATUS')||'');
          await rpc('result',cycle,{...outcome});continue;
        }
        if(cycle.state==='pending' && cycle.processor_id) {
          const outcome=await securityCharge(connection.environment,accessToken,method.payment_type,method.qbo_method_id,Number(cycle.amount),crypto.randomUUID(),
            `Security monitoring ${contract.contract_number}`,Deno.env.get('SECURITY_ACH_SETTLED_STATUS')||'',cycle.processor_id);
          await rpc('result',cycle,{...outcome});
        }
      } catch(error) {
        await rpc('defer',cycle,{message:error instanceof Error?error.message:'Billing needs review'}).catch(()=>undefined);
      }
    }
    return json({success:true,processed});
  } catch {return json({error:'Security recurring billing could not complete'},500);}
});

async function sendNotice(to:string,settings:Record<string,string>|null,subject:string,text:string,key:string) {
  const apiKey=Deno.env.get('RESEND_API_KEY');
  if(!to || !apiKey || !settings?.from_email || !settings.company_email) throw new Error('Customer email and company email settings are required before an automatic debit');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':key},
    body:JSON.stringify({from:`${settings.from_name||settings.company_name} <${settings.from_email}>`,to:[to],subject,text}),signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error('Advance payment notice could not be delivered; no debit is scheduled');
}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
