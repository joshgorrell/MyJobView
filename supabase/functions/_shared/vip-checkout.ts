// This helper never trusts a redirect, browser amount, or payment-event amount.
// It rereads the actual invoice balance from the configured QBO company.
export function assertVipInvoice(checkout:any, invoice:any) {
 if (!invoice || String(invoice.Id)!==String(checkout.qbo_invoice_id) || String(invoice.CustomerRef?.value)!==String(checkout.qbo_customer_id)
   || invoice.TotalAmt==null || !Number.isFinite(Number(invoice.TotalAmt)) || Math.abs(Number(invoice.TotalAmt)-Number(checkout.total))>.005
   || invoice.Balance==null || !Number.isFinite(Number(invoice.Balance)) || Number(invoice.Balance)<0 || Number(invoice.TotalAmt)<=0)
   throw new Error('The VIP invoice needs provider review. Your membership has not been activated.');
}
export async function reconcileVipCheckout(admin:any,connection:any,invoiceId:string,request:any) {
 const {data:checkout,error}=await admin.from('vip_membership_checkouts').select('*').eq('organization_id',connection.organization_id)
  .eq('qbo_realm_id',connection.realm_id).eq('qbo_environment',connection.environment).eq('qbo_invoice_id',String(invoiceId)).maybeSingle();
 if(error)throw new Error('VIP payment status could not be checked.');
 if(!checkout)return null;
 if(checkout.status!=='pending')return checkout.status;
 const result=await request(admin,connection,'GET',`invoice/${encodeURIComponent(invoiceId)}?minorversion=75`);
 if(!result.ok)throw new Error('Payment verification is temporarily unavailable. Please check again.');
 const invoice=result.data?.Invoice;
 assertVipInvoice(checkout,invoice);
 if(Number(invoice.Balance)>.005)return 'pending';
 const {data:confirmed,error:confirmError}=await admin.rpc('confirm_vip_checkout_payment',{p_checkout_id:checkout.id,p_qbo_invoice_id:String(invoiceId)});
 if(confirmError)throw new Error('Payment was received but membership activation needs provider review.');
 return confirmed?'paid':'review';
}
export async function openVipCheckout(admin:any,connection:any,checkout:any,request:any,ensureCustomer:any) {
 if(!connection?.payments_enabled || !connection.vip_membership_item_id)throw new Error('Online VIP checkout is not ready. Please contact your representative to activate a plan.');
 if(checkout.qbo_invoice_id && (checkout.qbo_realm_id!==connection.realm_id || checkout.qbo_environment!==connection.environment))throw new Error('The payment connection changed. Your provider needs to review this checkout.');
 if(!checkout.qbo_invoice_id){
  const customerId=await ensureCustomer(admin,connection,checkout.contact_id,request);
  const item=await request(admin,connection,'GET',`item/${encodeURIComponent(connection.vip_membership_item_id)}`);
  if(!item.ok || item.data?.Item?.Active===false || item.data?.Item?.Type!=='Service' || !item.data?.Item?.IncomeAccountRef?.value)throw new Error('Your provider needs to configure the VIP income item.');
  const result=await request(admin,connection,'POST',`invoice?requestid=vip-${checkout.id}`,{
   CustomerRef:{value:customerId},TxnDate:checkout.created_at.slice(0,10),DueDate:checkout.created_at.slice(0,10),
   PrivateNote:`VIP membership checkout ${checkout.id}`,AllowOnlineCreditCardPayment:true,AllowOnlineACHPayment:true,
   TxnTaxDetail:{TotalTax:Number(checkout.tax_amount)},
   Line:[{DetailType:'SalesItemLineDetail',Description:`${checkout.plan_name} — ${checkout.billing_frequency} VIP membership`,Amount:Number(checkout.subtotal),
    SalesItemLineDetail:{ItemRef:{value:connection.vip_membership_item_id},Qty:1,UnitPrice:Number(checkout.subtotal),TaxCodeRef:{value:Number(checkout.tax_amount)>0?'TAX':'NON'}}}]
  });
  if(!result.ok || !result.data?.Invoice?.Id)throw new Error('The secure payment invoice could not be prepared. Please retry.');
  const invoice=result.data.Invoice;
  // Persist the identity even if tax needs review; retries must never create another invoice.
  const identity={qbo_invoice_id:String(invoice.Id),qbo_customer_id:String(customerId),qbo_realm_id:connection.realm_id,qbo_environment:connection.environment};
  const saved=await admin.from('vip_membership_checkouts').update(identity).eq('id',checkout.id).eq('organization_id',connection.organization_id).eq('status','pending').select('id').maybeSingle();
  if(saved.error || !saved.data)throw new Error('Checkout could not be saved. Please retry.');
  Object.assign(checkout,identity);assertVipInvoice(checkout,invoice);
 }
 const status=await reconcileVipCheckout(admin,connection,checkout.qbo_invoice_id,request);
 if(status!=='pending')return {status,total:Number(checkout.total)};
 const result=await request(admin,connection,'GET',`invoice/${encodeURIComponent(checkout.qbo_invoice_id)}?include=invoiceLink`);
 if(!result.ok)throw new Error('The secure payment link is unavailable. Please retry.');
 assertVipInvoice(checkout,result.data?.Invoice);
 const link=result.data.Invoice.InvoiceLink;
 let url:URL;try{url=new URL(link);}catch{throw new Error('QuickBooks has not made online payment available for this invoice. Please contact your representative.');}
 if(url.protocol!=='https:' || url.username || url.password)throw new Error('The secure payment link is invalid. Please contact your representative.');
 const saved=await admin.from('vip_membership_checkouts').update({payment_url:url.href}).eq('id',checkout.id).eq('organization_id',connection.organization_id);
 if(saved.error)throw new Error('The payment link could not be saved. Please retry.');
 return {status:'pending',payment_url:url.href,total:Number(checkout.total)};
}
