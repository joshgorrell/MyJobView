import assert from 'node:assert/strict';
import {inspectTechsafePostgresSourceSchema as inspect} from '../../src/lib/techsafe/postgresSourceSchemaPreflight.mjs';
const required={
 'public.sales_orders':['id','organization_id','proposal_id'],
 'public.proposal_line_items':['id','organization_id','proposal_id','product_id','quantity'],
 'techsafe_source.integration_connections':['connection_id','sales_order_id','organization_id','proposal_id','connection_generation','enabled','status'],
 'techsafe_source.order_revision_ledger':['connection_id','sales_order_id','organization_id','proposal_id','connection_generation','revision','state','source_fingerprint'],
 'techsafe_source.equipment_snapshot_certificates':['certificate_id','connection_id','sales_order_id','organization_id','proposal_id','connection_generation','source_revision','source_fingerprint','equipment_fingerprint','equipment_count','state']
};
const rows=Object.entries(required).flatMap(([key,columns])=>columns.map(column=>({
 schema_name:key.split('.')[0],table_name:key.split('.')[1],column_name:column,data_type:'uuid'
})));
rows.push({schema_name:'public',table_name:'change_orders',column_name:'customer_approved_at',data_type:'timestamp with time zone'});
rows.push({schema_name:'public',table_name:'change_order_items',column_name:'proposal_line_item_id',data_type:'uuid'});
const calls=[];
const client={async query(sql){calls.push(sql);return {rows}}};
const good=await inspect(client);
assert.equal(good.ok,false);
assert.equal(good.requiredColumnsPresent,true);
assert.equal(good.reason,'approval_and_change_order_mapping_unverified');
assert.equal(good.changeOrderCandidates.length,2);
assert.equal(good.authorized,false);assert.equal(good.snapshotReady,false);
assert.match(calls[0],/pg_catalog.pg_attribute/);
assert.ok(!calls[0].includes('INSERT'));
const incomplete=await inspect({query:async()=>({rows:rows.filter(x=>x.column_name!=='proposal_id')})});
assert.equal(incomplete.requiredColumnsPresent,false);
assert.ok(incomplete.missing.some(x=>x==='public.sales_orders.proposal_id'));
assert.equal(incomplete.reason,'required_source_columns_missing');
assert.equal((await inspect({query:async()=>{throw Error('permission denied')}})).reason,'schema_catalog_query_failed');
assert.equal((await inspect({query:async()=>({rows:[{schema_name:'public',table_name:'sales_orders',column_name:'bad;drop',data_type:'text'}]})})).reason,'invalid_catalog_row');
assert.equal((await inspect({query:async()=>({rows:[rows[0],rows[0]]})})).reason,'duplicate_catalog_column');
console.log('PASS: source schema preflight discovers change-order candidates but never authorizes approval or export');
