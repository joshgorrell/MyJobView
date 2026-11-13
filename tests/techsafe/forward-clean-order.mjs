import assert from 'node:assert/strict';
import {createTechsafeCatalogSoldScopeReader} from '../../src/lib/techsafe/postgresCatalogSoldScopeReader.mjs';
const connectionId='02e394ef-9576-4a2a-b352-6506b23529d0',orderId='d8b30c4b-70d0-4180-aca0-907db5a5fa27';
const id=(n)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const source=[
 {id:id(1),productId:id(101),description:'Eligible catalog TV',quantity:1,unitPrice:999.95,soldLabor:150,catalogOwned:true},
 {id:id(2),productId:id(102),description:'Ineligible catalog cable',quantity:2,unitPrice:20,soldLabor:0,catalogOwned:true},
 {id:id(3),productId:id(103),description:'Approved added catalog mount',quantity:1,unitPrice:299.95,soldLabor:75,catalogOwned:true,committedChangeLineId:id(20)},
 {id:id(4),productId:id(104),description:'Removed catalog item',quantity:1,unitPrice:499.95,soldLabor:60,catalogOwned:true},
 {id:id(5),laborOnly:true,description:'Labor only',quantity:1,unitPrice:0,soldLabor:125},
 {id:id(6),productId:id(106),description:'Customer-supplied equipment labor',quantity:1,unitPrice:0,soldLabor:50,catalogOwned:true,customerSupplied:true}
];
const approved=[{id:id(20),actionType:'add',locked:true,active:false},
 {id:id(21),actionType:'remove',sourceLineId:id(4),removeScope:'parts_and_labor',originalQuantity:1,newQuantity:0,locked:true,active:false}];
const read=(lines=source,changes=approved,enabled=true)=>createTechsafeCatalogSoldScopeReader({query:async sql=>{
 if(sql.includes('FROM techsafe_source.integration_connections'))return {rows:[{organization_id:'org',proposal_id:'proposal',actual_proposal_id:'proposal',enabled,status:'active',approval_status:'approved',approved_at:'date'}]};
 if(sql.includes('FROM public.change_orders co'))return {rows:changes};
 if(sql.includes('FROM public.proposal_line_items pli'))return {rows:lines};
 throw Error('unexpected query');
}})({connectionId,orderId,minimumEligibleUnitPrice:250});
const ok=await read();assert.equal(ok.ready,true);assert.equal(ok.eligibleItems.length,2);
assert.deepEqual(ok.eligibleItems.map(x=>x.productId).sort(),[id(101),id(103)].sort());
assert.equal(ok.equipmentCents,133990);assert.equal(ok.soldLaborTotalCents,40000);
assert.deepEqual(ok.removedSourceLineIds,[id(4)]);
assert.equal((await read(source,approved,false)).reason,'connection_not_active');
assert.equal((await read(source,[...approved,{id:id(22),actionType:'add',locked:true,active:false}])).reason,'approved_addition_unreconciled');
assert.equal((await read(source,[...approved,{id:id(23),actionType:'add',locked:false,active:true}])).reason,'approved_change_not_committed');
assert.equal((await read(source.map(x=>x.id===id(3)?{...x,catalogOwned:false}:x))).reason,'invalid_source_line');
console.log('PASS forward clean order: eligibility, committed changes, labor, removal, tenant and fail-closed holds');
