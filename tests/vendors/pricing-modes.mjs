import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/lib/vendorPricing.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(js, { module, exports: module.exports, Error, Math, Number });
const { resolveVendorSellingPrice: resolve } = module.exports;

assert.equal(resolve({ mode: 'fixed', currentSellingPrice: 999, dealerCost: 800, retailPrice: 1099 }).sellingPrice, 999);
assert.equal(resolve({ mode: 'retail', currentSellingPrice: 999, dealerCost: 800, retailPrice: 1099 }).sellingPrice, 1099);
assert.equal(resolve({ mode: 'retail', currentSellingPrice: 999, dealerCost: 800 }).sellingPrice, 999);
assert.equal(resolve({ mode: 'margin', currentSellingPrice: 999, dealerCost: 600, targetMarginPercent: 40 }).sellingPrice, 1000);
assert.equal(resolve({ mode: 'margin', currentSellingPrice: 999, dealerCost: 650, targetMarginPercent: 40 }).sellingPrice, 1083.33);
assert.equal(resolve({ mode: 'margin', currentSellingPrice: 999, targetMarginPercent: 40 }).sellingPrice, 999);
assert.equal(resolve({ mode: 'margin', currentSellingPrice: 999, dealerCost: 650, targetMarginPercent: 100 }).sellingPrice, 999);
assert.equal(resolve({ mode: 'fixed', currentSellingPrice: 999, dealerCost: 650 }).changed, false);
assert.throws(() => resolve({ mode: 'unknown', currentSellingPrice: 999 }));
console.log('Vendor pricing mode tests passed');
