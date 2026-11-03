// Resolve each accepted service to its own accounting item. Amounts always come
// from the MJV invoice; QuickBooks catalog prices never overwrite signed prices.
export async function resolveSecurityInvoiceItems(admin:any, connection:any, lines:any[], request:any):Promise<any[]> {
  const resolved=[];
  const cache=new Map<string,string>();
  let incomeAccount:string|undefined;
  for (const line of [...lines].sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0))) {
    const name=String(line.security_service_name||'').trim();
    if (!name || name.length>100 || name.includes(':') || (!line.security_service_id && name!=='Mailed invoice fee')) {
      throw new Error('Review the accepted service identity/name before syncing this invoice to QuickBooks');
    }
    const localId=`security-service:${connection.environment}:${connection.realm_id}:${line.security_service_id||'mail-fee'}:${name}`;
    let itemId=cache.get(localId);
    if(!itemId) {
      const {data:mapping,error:mappingError}=await admin.from('qbo_entity_mappings').select('qbo_id').eq('organization_id',connection.organization_id).eq('entity_type','item').eq('local_id',localId).maybeSingle();
      if(mappingError) throw new Error('QuickBooks service item mapping could not be read');
      if(mapping?.qbo_id) {
        const result=await request(admin,connection,'GET',`item/${encodeURIComponent(mapping.qbo_id)}`);
        const item=result.data?.Item;
        if(result.ok && item?.Active!==false && item?.Name===name && item?.Type==='Service') itemId=String(item.Id);
      }
      if(!itemId) {
        const escaped=name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        const found=await request(admin,connection,'GET',`query?query=${encodeURIComponent(`select * from Item where Name = '${escaped}'`)}&minorversion=75`);
        if(!found.ok) throw new Error('QuickBooks service items could not be checked; no invoice or debit submitted');
        const matches=found.data?.QueryResponse?.Item||[];
        if(matches.length>1 || (matches.length===1 && (matches[0].Active===false || matches[0].Type!=='Service'))) throw new Error(`Review the QuickBooks service item named ${name}`);
        if(matches.length===1) itemId=String(matches[0].Id);
        else {
          if(!incomeAccount) {
            const seed=await request(admin,connection,'GET',`item/${encodeURIComponent(connection.security_monitoring_item_id)}`);
            if(!seed.ok || seed.data?.Item?.Active===false || !seed.data?.Item?.IncomeAccountRef?.value) throw new Error('Configure an active monitoring sales item with an income account before syncing service items');
            incomeAccount=String(seed.data.Item.IncomeAccountRef.value);
          }
          const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(localId));
          const key=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,32);
          const created=await request(admin,connection,'POST',`item?requestid=sec-item-${key}`,{Name:name,Type:'Service',IncomeAccountRef:{value:incomeAccount}});
          if(!created.ok || !created.data?.Item?.Id || created.data.Item.Name!==name) throw new Error(`QuickBooks service item ${name} needs reconciliation before invoice sync`);
          itemId=String(created.data.Item.Id);
        }
        const {error}=await admin.from('qbo_entity_mappings').upsert({organization_id:connection.organization_id,entity_type:'item',local_id:localId,qbo_id:itemId,last_synced_at:new Date().toISOString()},{onConflict:'organization_id,entity_type,qbo_id'});
        if(error) throw new Error('QuickBooks service item mapping could not be saved; retry invoice synchronization');
      }
      cache.set(localId,itemId!);
    }
    resolved.push({...line,qbo_item_id:itemId});
  }
  if(!resolved.length) throw new Error('A security invoice requires itemized services before QuickBooks sync');
  return resolved;
}
