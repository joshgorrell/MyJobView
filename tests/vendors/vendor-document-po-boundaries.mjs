import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies={}) {
  const module={exports:{}};
  const source=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,require(name){if(name in dependencies)return dependencies[name];throw Error('Unknown dependency '+name);}});
  return module.exports;
}
const pricing=load('src/lib/vendorPricing.ts');
const sync=load('src/lib/vendorPriceSync.ts',{'./vendorPricing':pricing});
const doc=load('src/lib/documentPriceSnapshot.ts');
const po=load('src/lib/purchaseOrderCostSnapshot.ts');

const product={organizationId:'tenant-a',productId:'product-a',vendorId:'vendor-a',pricingMode:'retail',dealerCost:300,sellingPrice:500,retailPrice:500,targetMarginPercent:null};
const now=new Date('2026-11-21T19:00:00Z');
const quote={organizationId:'tenant-a',productId:'product-a',vendorId:'vendor-a',authorized:true,dealerCost:325,retailPrice:550,costVerifiedAt:now.toISOString(),retailVerifiedAt:now.toISOString()};
const original=doc.snapshotDocumentLine({unit_price:500,quantity:2,amount:0,cost:300});
const edited=doc.applyUserDocumentPriceEdit(original,475);
const ordered=po.snapshotPurchaseOrderLine({unit_cost:325,quantity:2,extended_cost:0});
const update=sync.planAuthorizedVendorPriceUpdate(product,quote,now,24*60*60*1000);
assert.equal(update.patch.cost,325);
assert.equal(update.patch.our_price,550);
const refreshed=doc.refreshDocumentLineCost(edited,update.patch.cost);
assert.equal(refreshed.unit_price,475,'vendor MSRP must not reprice an existing user-edited document');
assert.equal(refreshed.amount,950);
assert.equal(doc.copyDocumentLineToNextStage(refreshed).unit_price,475);
const oldPo=po.preservePurchaseOrderOnVendorUpdate(ordered);
assert.equal(oldPo.unit_cost,325,'vendor cost update must not reprice an existing PO');
assert.equal(oldPo.extended_cost,650);
const actual=po.recordActualPurchaseCost(oldPo,350);
assert.equal(actual.unit_cost,325);
assert.equal(po.purchaseCostVariance(actual),50);
assert.throws(()=>sync.planAuthorizedVendorPriceUpdate(product,{...quote,organizationId:'tenant-b'},now,86400000),/authorized/);
console.log('Vendor retail, manual price, PO historical cost boundaries passed');
