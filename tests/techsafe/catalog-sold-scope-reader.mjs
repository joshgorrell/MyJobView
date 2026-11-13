import assert from 'node:assert/strict';
import {createTechsafeCatalogSoldScopeReader} from '../../src/lib/techsafe/postgresCatalogSoldScopeReader.mjs';
const conn='02e394ef-9576-4a2a-b352-6506b23529d0',order='d8b30c4b-70d0-4180-aca0-907db5a5fa27';
const misc='715017c5-c899-4cc0-8b83-b2c2a634c380';
const base={organization_id:'org',proposal_id:'proposal',actual_proposal_id:'proposal',enabled:true,status:'active',approval_status:'approved',approved_at:'date'};
const make=(count=0,rows=[])=>createTechsafeCatalogSoldScopeReader({query:async sql=>
 sql.includes('FROM techsafe_source.integration_connections')?{rows:[base]}:
 sql.includes('FROM public.change_orders co')?{rows:[{count}]}:{rows}});
const line={lineId:'dc758ebe-4547-4759-9e9e-07e2dfa17ff3',productId:misc,description:'One-time oddball mount',quantity:1,unitPrice:'449.95',soldLabor:'67.50',catalog_found:true,isMisc:true};
const ok=await make(0,[line])({connectionId:conn,orderId:order,minimumEligibleUnitPrice:250});
assert.equal(ok.ready,true);assert.equal(ok.items[0].itemKind,'misc');assert.equal(ok.equipmentCents,44995);assert.equal(ok.equipmentLinkedLaborCents,6750);
assert.equal((await make(1,[line])({connectionId:conn,orderId:order})).reason,'approved_change_scope_unreconciled');
assert.equal((await make(0,[{...line,productId:null,catalog_found:false}])({connectionId:conn,orderId:order})).reason,'catalog_product_reconciliation_required');
assert.equal((await make(0,[{...line,productId:'11111111-1111-4111-8111-111111111111',catalog_found:false}])({connectionId:conn,orderId:order})).reason,'catalog_product_reconciliation_required');
console.log('PASS catalog-backed Misc sold scope and fail-closed legacy records');
