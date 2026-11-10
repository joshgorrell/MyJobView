// Server-only PostgreSQL catalog audit. Discovers actual approval/change-order
// storage without guessing column names or granting export authority.
// Never expose catalog details through a public RPC or user-facing endpoint.
const hold=(reason,extra={})=>Object.freeze({ok:false,authorized:false,snapshotReady:false,reason,...extra});
const REQUIRED={
 'public.sales_orders':['id','organization_id','proposal_id'],
 'public.proposal_line_items':['id','organization_id','proposal_id','product_id','quantity'],
 'techsafe_source.integration_connections':['connection_id','sales_order_id','organization_id','proposal_id','connection_generation','enabled','status'],
 'techsafe_source.order_revision_ledger':['connection_id','sales_order_id','organization_id','proposal_id','connection_generation','revision','state','source_fingerprint'],
 'techsafe_source.equipment_snapshot_certificates':['certificate_id','connection_id','sales_order_id','organization_id','proposal_id','connection_generation','source_revision','source_fingerprint','equipment_fingerprint','equipment_count','state']
};
const IDENT=/^[a-z_][a-z_0-9]*$/;
export async function inspectTechsafePostgresSourceSchema(client){
 if(!client||typeof client.query!=='function')throw new TypeError('trusted_postgres_client_required');
 try{
  const columns=await client.query(`SELECT n.nspname AS schema_name,c.relname AS table_name,
   a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS data_type
   FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
   WHERE c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
    AND n.nspname IN ('public','techsafe_source')
   ORDER BY n.nspname,c.relname,a.attnum`);
  if(!Array.isArray(columns.rows))return hold('schema_catalog_unavailable');
  const tables=new Map();
  for(const row of columns.rows){
   if(!IDENT.test(row.schema_name||'')||!IDENT.test(row.table_name||'')||
      !IDENT.test(row.column_name||''))return hold('invalid_catalog_row');
   const key=row.schema_name+'.'+row.table_name;
   if(!tables.has(key))tables.set(key,new Map());
   if(tables.get(key).has(row.column_name))return hold('duplicate_catalog_column');
   tables.get(key).set(row.column_name,row.data_type);
  }
  const missing=[];
  for(const [table,required] of Object.entries(REQUIRED))
   for(const column of required)
    if(!tables.get(table)?.has(column))missing.push(table+'.'+column);
  const candidates=[...tables].filter(([name])=>name.startsWith('public.')&&
   /change.?order|change.?line|approval|signature/i.test(name))
   .map(([name,cols])=>Object.freeze({table:name,
    columns:Object.freeze([...cols].map(([column,type])=>Object.freeze({column,type})))}));
  // Schema presence alone cannot establish customer approval or exhaustive
  // change-order history. Explicitly prevent promotion to source authority.
  return hold(missing.length?'required_source_columns_missing':'approval_and_change_order_mapping_unverified',{
   requiredColumnsPresent:missing.length===0,
   missing:Object.freeze(missing),
   changeOrderCandidates:Object.freeze(candidates)
  });
 }catch{return hold('schema_catalog_query_failed');}
}
