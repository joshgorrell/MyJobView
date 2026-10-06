import {getSupabaseAdmin,qboRequest,getEntityMapping,upsertEntityMapping,logSyncOperation} from './qbo-client.ts';
export async function pushInvoice(db:ReturnType<typeof getSupabaseAdmin>,connection:any,organizationId:string,invoiceId:string):Promise<{success:boolean;qbo_invoice_id?:string;error?:string}> {
 const {data:invoice,error}=await db.from('invoices').select('*,contacts(*),invoice_line_items(*)').eq('id',invoiceId).eq('organization_id',organizationId).maybeSingle();
 if(error || !invoice) return {success:false,error:'Invoice not found'};
 if(['draft','void'].includes(invoice.status)) return {success:false,error:'Publish an invoice before synchronizing it'};
 if(invoice.security_billing_cycle_id) return {success:false,error:'Monitoring invoices use the security billing workflow'};
 if(!invoice.contacts?.qbo_customer_id) return {success:false,error:'Contact is not linked to QuickBooks'};
 if((invoice.invoice_line_items || []).some((item:any)=>!(item.item_type==='material'?connection.service_parts_item_id:connection.service_labor_item_id))) return {success:false,error:'Configure QuickBooks invoice labor and parts income items'};
 const mapping=await getEntityMapping(db,organizationId,'invoice',invoiceId);
 const payload:any={CustomerRef:{value:invoice.contacts.qbo_customer_id},TxnDate:invoice.invoice_date,DueDate:invoice.due_date,
  AllowOnlineCreditCardPayment:!!connection.payments_enabled,AllowOnlineACHPayment:!!connection.payments_enabled,
  TxnTaxDetail:{TotalTax:Number(invoice.tax_amount || 0)},
  Line:(invoice.invoice_line_items || []).sort((a:any,b:any)=>a.sort_order-b.sort_order).map((item:any,index:number)=>({DetailType:'SalesItemLineDetail',Description:item.description,Amount:Number(item.amount),LineNum:index+1,SalesItemLineDetail:{ItemRef:{value:item.item_type==='material'?connection.service_parts_item_id:connection.service_labor_item_id},Qty:Number(item.quantity),UnitPrice:Number(item.unit_price),TaxCodeRef:{value:item.is_taxable && Number(invoice.tax_amount)>0?'TAX':'NON'}}}))};
 if(mapping){payload.Id=mapping.qbo_id;payload.SyncToken=mapping.qbo_sync_token;payload.sparse=true;}
 let result=await qboRequest(db,connection,'POST',mapping?'invoice':`invoice?requestid=${invoiceId}`,payload);
 if(mapping && !result.ok && result.data?.Fault?.Error?.[0]?.code==='3200'){
  const current=await qboRequest(db,connection,'GET',`invoice/${mapping.qbo_id}`);
  if(current.ok && current.data?.Invoice) result=await qboRequest(db,connection,'POST','invoice',{...payload,SyncToken:current.data.Invoice.SyncToken});
 }
 if(!result.ok || !result.data?.Invoice?.Id) return {success:false,error:result.data?.Fault?.Error?.[0]?.Message || 'QuickBooks invoice synchronization failed'};
 const remote=result.data.Invoice,qboId=String(remote.Id);
 // Keep the mapping even when dealer tax configuration requires correction; retries update the same remote invoice.
 await upsertEntityMapping(db,organizationId,'invoice',invoiceId,qboId,remote.SyncToken);
 if(!Number.isFinite(Number(remote.TotalAmt)) || Math.abs(Number(remote.TotalAmt)-Number(invoice.total))>.01) return {success:false,error:'QuickBooks total differs from the published invoice; review tax configuration'};
 const total=Number(remote.TotalAmt),amountDue=Number(remote.Balance),amountPaid=Math.max(0,total-amountDue);
 if(!Number.isFinite(amountDue)) return {success:false,error:'QuickBooks invoice balance is unavailable'};
 const saved=await db.from('invoices').update({qbo_invoice_id:qboId,synced_at:new Date().toISOString(),amount_paid:amountPaid,amount_due:amountDue,status:amountDue<=0?'paid':amountPaid>0?'partial':'submitted'}).eq('id',invoiceId).eq('organization_id',organizationId);
 if(saved.error) return {success:false,error:saved.error.message};
 const linkResult=await qboRequest(db,connection,'GET',`invoice/${qboId}?include=invoiceLink`);
 const link=linkResult.data?.Invoice?.InvoiceLink;
 if(typeof link==='string' && link.startsWith('https://')) {
  const savedLink=await db.from('invoices').update({qbo_payment_url:link}).eq('id',invoiceId).eq('organization_id',organizationId);
  if(savedLink.error) return {success:false,error:savedLink.error.message};
 }
 await logSyncOperation(db,organizationId,'to_quickbooks',mapping?'update':'create','invoice',invoiceId,qboId,'success');
 return {success:true,qbo_invoice_id:qboId};
}
