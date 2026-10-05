// Called only after agreement-scoped access and Payments capability checks.
export async function ensureSecurityQboCustomer(admin:any, connection:any, contactId:string, request:any):Promise<string> {
 const {data:contact,error}=await admin.from('contacts').select('qbo_customer_id,contact_name,full_name,first_name,last_name,email,phone').eq('id',contactId).eq('organization_id',connection.organization_id).maybeSingle();
 if(error || !contact) throw new Error('Your provider needs to review the customer account before payment enrollment.');
 if(contact.qbo_customer_id) return String(contact.qbo_customer_id);
 const {data:mapping,error:mappingError}=await admin.from('qbo_entity_mappings').select('qbo_id').eq('organization_id',connection.organization_id).eq('entity_type','customer').eq('local_id',contactId).maybeSingle();
 if(mappingError) throw new Error('Customer synchronization could not be checked. Please retry.');
 let customerId=mapping?.qbo_id;
 const name=String(contact.contact_name || contact.full_name || '').trim();
 const email=String(contact.email || '').trim();
 if(!customerId) {
  if(!name || name.length>500 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Your provider needs to confirm the customer name and email before payment enrollment.');
  const escaped=name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const found=await request(admin,connection,'GET',`query?query=${encodeURIComponent(`select * from Customer where DisplayName = '${escaped}'`)}&minorversion=75`);
  if(!found.ok) throw new Error('QuickBooks customer synchronization is unavailable. Please retry.');
  const matches=found.data?.QueryResponse?.Customer || [];
  if(matches.length>1 || (matches.length===1 && (matches[0].Active===false || String(matches[0].PrimaryEmailAddr?.Address || '').trim().toLowerCase()!==email.toLowerCase()))) throw new Error('Your provider needs to review an existing QuickBooks customer with the same name before payment enrollment.');
  if(matches.length===1) customerId=matches[0].Id;
  else {
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${connection.organization_id}:${connection.environment}:${connection.realm_id}:${contactId}`));
   const key=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,32);
   // The minimal, stable payload makes concurrent requests/retries the same operation.
   const result=await request(admin,connection,'POST',`customer?requestid=sec-customer-${key}`,{DisplayName:name,PrimaryEmailAddr:{Address:email}});
   if(!result.ok || !result.data?.Customer?.Id) throw new Error('QuickBooks customer synchronization could not be completed. Please retry or contact your provider.');
   customerId=result.data.Customer.Id;
  }
 }
 if(!customerId) throw new Error('QuickBooks returned an incomplete customer account.');
 const {error:saveError}=await admin.from('contacts').update({qbo_customer_id:String(customerId),qbo_sync_status:'synced',qbo_synced_at:new Date().toISOString(),qbo_sync_error:null}).eq('id',contactId).eq('organization_id',connection.organization_id);
 if(saveError) throw new Error('The customer link could not be saved. Please retry payment enrollment.');
 return String(customerId);
}
