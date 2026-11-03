import {getSupabaseAdmin,getConnection,qboRequest} from '../_shared/qbo-client.ts';
import {pushInvoice} from '../_shared/qbo-invoice-push.ts';
import {sendSystemEmail} from '../_shared/system-email.ts';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
Deno.serve(async req => {
 const db=getSupabaseAdmin();
 const secret=req.headers.get('Authorization')?.replace(/^Bearer /,'') || '';
 const auth=await db.rpc('security_billing_worker_authorized',{p_secret:secret});
 if(auth.error || auth.data!==true) return Response.json({error:'Unauthorized'},{status:401});
 const claimed=await db.rpc('claim_invoice_portal_deliveries');
 if(claimed.error) return Response.json({error:claimed.error.message},{status:500});
 let sent=0;
 for(const delivery of claimed.data || []) {
  try {
   const {data:invoice,error}=await db.from('invoices').select('*,contacts(email,full_name,contact_name)').eq('id',delivery.invoice_id).eq('organization_id',delivery.organization_id).single();
   if(error) throw error;
   if(!invoice.portal_visible || ['draft','void'].includes(invoice.status)) {
    await db.from('invoice_portal_deliveries').update({status:'skipped',lease_until:null}).eq('invoice_id',invoice.id);continue;
   }
   if(!invoice.contacts?.email) throw new Error('Customer email is missing');
   const {data:settings,error:settingsError}=await db.from('company_settings').select('from_email,from_name,company_name,company_email,reply_to_email,portal_url,app_url,portal_invoices_enabled').eq('organization_id',delivery.organization_id).single();
   if(settingsError) throw settingsError;
   if(!settings.portal_invoices_enabled) throw new Error('Enable invoices in customer portal settings');
   const {data:org}=await db.from('organizations').select('subdomain').eq('id',delivery.organization_id).single();
   const portal=settings.portal_url || (org?.subdomain ? `https://${org.subdomain}.myjobview.com` : settings.app_url ? `${settings.app_url.replace(/\/$/,'')}/portal` : null);
   if(!portal || !portal.startsWith('https://')) throw new Error('Configure the customer portal URL');
   const sender=settings.from_email || settings.company_email;
   if(!sender || sender.endsWith('@resend.dev')) throw new Error('Configure a verified invoice email sender');
   // Synchronize service invoices before announcing that their online payment is ready.
   if(invoice.work_order_billing_request_id && invoice.amount_due>0 && !invoice.qbo_payment_url) {
    const connection=await getConnection(db,delivery.organization_id);
    if(!connection?.payments_enabled) throw new Error('Connect QuickBooks Payments before online invoice delivery');
    {
     const pushed=await pushInvoice(db,connection,delivery.organization_id,invoice.id);
     if(!pushed.success) throw new Error(pushed.error);
    }
    const {data:fresh}=await db.from('invoices').select('qbo_invoice_id,qbo_payment_url,total').eq('id',invoice.id).eq('organization_id',delivery.organization_id).single();
    if(Math.abs(Number(fresh?.total)-Number(invoice.total))>.01) throw new Error('QuickBooks invoice total differs; review tax setup');
    let link=fresh?.qbo_payment_url;
    if(!link && fresh?.qbo_invoice_id) {
     const result=await qboRequest(db,connection,'GET',`invoice/${fresh.qbo_invoice_id}?include=invoiceLink`);
     link=result.data?.Invoice?.InvoiceLink;
     if(typeof link==='string' && link.startsWith('https://')) await db.from('invoices').update({qbo_payment_url:link}).eq('id',invoice.id).eq('organization_id',delivery.organization_id);
    }
    if(typeof link!=='string' || !link.startsWith('https://')) throw new Error('QuickBooks online payment link is not ready');
   }
   let payload=delivery.email_payload;
   if(!payload) {
    const target=new URL(portal);if(target.pathname==='/')target.pathname='/portal';target.searchParams.set('tab','invoices');target.searchParams.set('invoice',invoice.id);const url=target.toString();
    payload={from:`${String(settings.from_name || settings.company_name || 'MyJobView').replace(/[<>\r\n]/g,'')} <${sender}>`,to:[invoice.contacts.email],reply_to:settings.reply_to_email || settings.company_email || sender,subject:`Invoice #${invoice.invoice_number} from ${settings.company_name || 'MyJobView'}`,html:`<p>Hello ${escape(invoice.contacts.full_name || invoice.contacts.contact_name || 'there')},</p><p>Your invoice #${escape(invoice.invoice_number)} is available in your customer portal.</p><p>Amount due: $${Number(invoice.amount_due).toFixed(2)}</p><p><a href="${escape(url)}">View invoice${invoice.work_order_billing_request_id && invoice.amount_due>0 ? ' and pay online' : ''}</a></p>`};
    const saved=await db.from('invoice_portal_deliveries').update({email_payload:payload}).eq('invoice_id',invoice.id);
    if(saved.error) throw saved.error;
   }
   const response=await sendSystemEmail({headers:{'Idempotency-Key':`invoice-portal-${invoice.id}-v${delivery.revision}`},body:JSON.stringify(payload)});
   if(!response.ok) throw new Error(`Email delivery failed (${response.status})`);
   const updated=await db.from('invoice_portal_deliveries').update({status:'sent',sent_at:new Date().toISOString(),lease_until:null,error:null}).eq('invoice_id',invoice.id);
   if(updated.error) throw updated.error;
   await db.from('service_billing_queue').update({status:invoice.amount_due<=0?'paid':'payment_pending'}).eq('invoice_id',invoice.id).eq('organization_id',delivery.organization_id);
   sent++;
  } catch(error) {
   await db.from('invoice_portal_deliveries').update({status:'failed',error:error instanceof Error?error.message:'Invoice delivery failed',lease_until:null,available_at:new Date(Date.now()+Math.min(60,2**Math.min(delivery.attempts,6))*60000).toISOString()}).eq('invoice_id',delivery.invoice_id);
  }
 }
 return Response.json({processed:claimed.data?.length || 0,sent});
});
