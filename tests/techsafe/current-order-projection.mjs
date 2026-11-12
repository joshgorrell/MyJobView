import assert from 'node:assert/strict';
import {projectCurrentSalesOrderForTechsafe} from '../../src/lib/techsafe/projectCurrentSalesOrderForTechsafe.mjs';
const product=(id,unit,quantity,lineTotal)=>({sourceLineId:id,productRef:'product_'+id,
 unitSalePriceCents:unit,quantity,lineSaleTotalCents:lineTotal,laborSaleTotalCents:0});
const source={ok:true,source:'current_approved_sales_order',issues:[],
 soldLaborCents:53750,equipment:[product('speaker',10000,4,40000),
 product('receiver',29995,1,63745)]};
const result=projectCurrentSalesOrderForTechsafe(source,{minimumUnitValueCents:25000});
assert.equal(result.ok,true);
assert.equal(result.authorized,false);
assert.equal(result.snapshotReady,false);
assert.equal(result.lines.length,2);
assert.equal(result.qualifyingProductCount,1);
assert.equal(result.lines[0].unitEquipmentValueCents,10000);
assert.equal(result.lines[1].unitEquipmentValueCents,29995);
assert.equal(result.soldLaborCents,53750);
assert.equal(result.noChangeOrderReplay,true);
assert.equal(result.lines.every(x=>x.productKind==='equipment'&&x.scope==='included'),true);
const draft=projectCurrentSalesOrderForTechsafe({...source,issues:[{reason:'labor_amount_unresolved'}]},{minimumUnitValueCents:25000});
assert.equal(draft.ok,false);
assert.equal(draft.reason,'source_field_mapping_needs_attention');
assert.equal(projectCurrentSalesOrderForTechsafe({...source,equipment:[product('speaker',10000,4,40000),product('speaker',10000,4,40000)]},{minimumUnitValueCents:25000}).ok,false);
assert.equal(projectCurrentSalesOrderForTechsafe({...source,equipment:[product('speaker',-1,1,0)]},{minimumUnitValueCents:25000}).ok,false);
assert.equal(projectCurrentSalesOrderForTechsafe(source,{minimumUnitValueCents:-1}).ok,false);
console.log('PASS: approved current Sales Order maps to Techsafe product unit prices and all sold labor without change-order replay or false authorization');
