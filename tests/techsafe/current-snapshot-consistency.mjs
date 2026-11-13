import assert from 'node:assert/strict';
import {validateTechsafeCurrentEquipmentSnapshot as check} from '../../supabase/functions/_shared/techsafe-current-snapshot-consistency.mjs';
const org='org',line={id:'line',product_id:'product',product_organization_id:org,item_type:'material',catalog_item_type:'material',quantity:2,unit_price:'19.99',is_hidden:false,is_customer_supplied:false,approved_removed:false};
const source={binding:{organization_id:org},lines:[line]};
const equipment={sourceLineId:'line',productRef:'product',productKind:'equipment',scope:'included',customerSupplied:false,techsafeExcluded:false,quantity:2,unitEquipmentValueCents:1999};
assert.equal(check(source,{lines:[equipment]}).valid,true);
for(const l of [{...equipment,quantity:3},{...equipment,unitEquipmentValueCents:2000},{...equipment,productRef:'other'},{...equipment,scope:'removed'}])assert.equal(check(source,{lines:[l]}).valid,false);
assert.equal(check(source,{lines:[]}).reason,'eligible_equipment_omitted');
assert.equal(check(source,{lines:[equipment,equipment]}).reason,'duplicate_snapshot_line');
assert.equal(check({...source,lines:[{...line,is_customer_supplied:true}]},{lines:[equipment]}).valid,false);
assert.equal(check({...source,lines:[{...line,is_hidden:true,approved_removed:true}]},{lines:[{...equipment,scope:'removed'}]}).valid,true);
assert.equal(check({...source,lines:[{...line,unit_price:'19.999'}]},{lines:[equipment]}).valid,false);
assert.equal(check({...source,lines:[{...line,product_organization_id:'other'}]},{lines:[equipment]}).valid,false);
console.log('Current equipment snapshot consistency checks passed');

assert.equal(check(source,{lines:[{...equipment,sourceLineId:'fabricated',productKind:'labor'}]}).reason,'snapshot_line_not_in_source');
assert.equal(check(source,{lines:[{...equipment,productKind:'miscellaneous'}]}).reason,'eligible_equipment_reclassified');
assert.equal(check(source,{lines:[{...equipment,customerSupplied:true}]}).reason,'equipment_exclusion_flag_mismatch');
assert.equal(check(source,{lines:[{...equipment,techsafeExcluded:true}]}).reason,'equipment_exclusion_flag_mismatch');
assert.equal(check({...source,lines:[{...line,item_type:'labor',catalog_item_type:'labor'}]},{lines:[{...equipment,productKind:'labor',productRef:'other'}]}).reason,'non_equipment_product_mismatch');

// An eligible sold product cannot be disguised as any non-equipment kind.
for(const kind of ['labor','fee','tax','consumable','subscription','unclassified','miscellaneous'])
 assert.equal(check(source,{lines:[{...equipment,productKind:kind}]}).reason,'eligible_equipment_reclassified');
for(const price of ['0','0.00','1','123.4','123.45']){
 const expected=Math.round(Number(price)*100);
 assert.equal(check({...source,lines:[{...line,unit_price:price}]},{lines:[{...equipment,unitEquipmentValueCents:expected}]}).valid,true);
}

// Hidden presentation alone never removes a sold product from coverage.
const hiddenSource={...source,lines:[{...line,is_hidden:true}]};
assert.equal(check(hiddenSource,{lines:[equipment]}).valid,true);
assert.equal(check(hiddenSource,{lines:[]}).reason,'eligible_equipment_omitted');
assert.equal(check(hiddenSource,{lines:[{...equipment,scope:'removed'}]}).reason,'equipment_scope_mismatch');
assert.equal(check({...source,lines:[{...line,approved_removed:true}]},{lines:[]}).reason,'approved_removal_evidence_unverified');
assert.equal(check({...source,lines:[{...line,approved_removed:undefined}]},{lines:[equipment]}).reason,'approved_removal_evidence_unverified');
const manual={...line,product_id:null,product_organization_id:null,catalog_item_type:null,description:'Manual TV'};
const manualEquipment={...equipment,productRef:'line_line',description:'Manual TV'};
assert.equal(check({...source,lines:[manual]},{lines:[manualEquipment]}).valid,true);
assert.equal(check({...source,lines:[manual]},{lines:[]}).reason,'eligible_equipment_omitted');
assert.equal(check({...source,lines:[manual]},{lines:[{...manualEquipment,description:'Other'}]}).reason,'manual_equipment_description_mismatch');
