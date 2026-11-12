import assert from 'node:assert/strict';
import {prepareCurrentSalesOrderTechsafeSnapshot} from '../../supabase/functions/_shared/techsafe-current-order-snapshot.mjs';
import {prepareTechsafeTransportSnapshot} from '../../supabase/functions/_shared/techsafe-transport-contract.mjs';
const binding={connectionId:'connection1',organizationId:'org1',orderId:'order1',proposalId:'proposal1',generation:2};
const source={ok:true,source:'current_approved_sales_order',organizationId:'org1',orderId:'order1',
 proposalId:'proposal1',contactId:'customer1',soldLaborCents:53750,issues:[],
 equipment:[{sourceLineId:'speaker',productRef:'speaker1',quantity:4,unitSalePriceCents:10000,lineSaleTotalCents:40000},
 {sourceLineId:'receiver',productRef:'receiver1',quantity:1,unitSalePriceCents:29995,lineSaleTotalCents:63745}]};
const args={source,connection:binding,revision:3,eventId:'event3',sourceInstanceId:'mjv1',
 customerName:'Test Customer',siteRef:'site1',minimumUnitValueCents:25000};
const mapped=prepareCurrentSalesOrderTechsafeSnapshot(args);
assert.equal(mapped.ready,true);
assert.equal(mapped.authorized,false);
assert.equal(mapped.snapshotReady,false);
assert.equal(mapped.snapshot.soldLaborCents,53750);
assert.equal(mapped.snapshot.lines.length,2);
assert.equal(mapped.snapshot.lines[0].unitEquipmentValueCents,10000);
assert.equal(mapped.snapshot.lines[1].unitEquipmentValueCents,29995);
assert.equal(mapped.snapshot.generation,2);
assert.equal(mapped.snapshot.revision,3);
// Validate that a trusted certificate, if later issued, would satisfy the
// receiver envelope. This test does NOT issue such a certificate.
const authority={verified:true,sourceAuthorized:true,scopeVerified:true,snapshotReady:true,
 connectionId:binding.connectionId,organizationId:binding.organizationId,
 orderId:binding.orderId,proposalId:binding.proposalId,generation:2,revision:3,
 snapshot:mapped.snapshot};
const evidence={valid:true,sales_order_id:'order1',approved_proposal_id:'proposal1',
 organization_id:'org1',connection_id:'connection1',equipment:[]};
const validated=prepareTechsafeTransportSnapshot({source:evidence,authority,binding,revision:3,eventId:'event3'});
assert.equal(validated.ready,true);
assert.equal(validated.snapshot.soldLaborCents,53750);
for(const invalid of [
 {...args,connection:{...binding,organizationId:'another'}},
 {...args,connection:{...binding,generation:0}},
 {...args,source:{...source,contactId:null}},
 {...args,source:{...source,issues:[{reason:'unmapped_line'}]}},
 {...args,source:{...source,soldLaborCents:null}},
 {...args,customerName:''},
 {...args,orderStatus:'cancelled'},
 {...args,minimumUnitValueCents:-1}
])assert.equal(prepareCurrentSalesOrderTechsafeSnapshot(invalid).ready,false);
console.log('PASS: direct current Sales Order creates valid Techsafe v2 equipment/labor payload without granting authority');
