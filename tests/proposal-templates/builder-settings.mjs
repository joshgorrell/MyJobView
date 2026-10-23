import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile('src/components/Proposals/ProposalBuilderCompact.tsx', 'utf8');
const ast = ts.createSourceFile('builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name) {
  let node;
  function visit(current) {
    if (ts.isFunctionDeclaration(current) && current.name?.text === name) node = current;
    ts.forEachChild(current, visit);
  }
  visit(ast);
  assert.ok(node, `Actual builder handler ${name} exists`);
  return ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
const apply = handler('applyTemplateSettings');
for (const sku of [true, false]) for (const model of [true, false]) {
  let options;
  const context = vm.createContext({ setPdfDisplayOptions: value => { options = value; }, template: {
    show_sku: sku, show_model_number: model, show_item_color: false, color_scheme: 'default',
    show_installed_price: false, show_labor_total: true, show_labor_hours: false, show_subtotal: true,
  } });
  vm.runInContext(`${apply}; applyTemplateSettings(template)`, context);
  assert.equal(options.showSKU, sku);
  assert.equal(options.showModelNumber, model);
  assert.equal(options.showColor, false);
  assert.equal(options.showInstalledPrice, false);
  assert.equal(options.showLaborPerLine, true);
}
const save = handler('saveAsTemplate');
async function saveCase({ personal = true, admin = false, existing = null, hidePrices = false } = {}) {
  const calls = [], notices = [];
  const query = table => {
    const q = { select() { return q; }, eq(field, value) { calls.push({ table, filter: [field, value] }); return q; },
      single: async () => ({ data: { id: 'current-company' }, error: null }),
      insert(data) { calls.push({ table, operation: 'insert', data }); return Promise.resolve({ error: null }); },
      update(data) { calls.push({ table, operation: 'update', data }); return q; }, then(resolve) { resolve({ error: null }); },
    };
    return q;
  };
  const context = vm.createContext({
    newTemplateName: ' Current settings ', newTemplateDescription: '', newTemplateIsPersonal: personal,
    canManageCompanyTemplates: admin, profile: { id: 'creator', organization_id: 'org' },
    selectedTemplateId: existing?.id ?? null, pdfTemplates: existing ? [existing] : [],
    pdfDisplayOptions: { showSKU: false, showModelNumber: true, showColor: true, showInstalledPrice: true, showLaborPerLine: false, hideAllPrices: hidePrices },
    supabase: { from: query }, setSavingTemplate() {}, setShowSaveTemplateModal() {}, setNewTemplateName() {},
    setNewTemplateDescription() {}, setNewTemplateIsPersonal() {}, loadPdfTemplates() {},
    notify: message => notices.push(message), console,
  });
  await vm.runInContext(`${save}; saveAsTemplate()`, context);
  return { calls, notices, write: calls.find(c => c.operation) };
}
let result = await saveCase();
assert.equal(result.write.operation, 'insert');
assert.equal(result.write.data.show_sku, false);
assert.equal(result.write.data.show_model_number, true);
assert.equal(result.write.data.show_item_color, true);
assert.equal(result.write.data.show_installed_price, true);
assert.equal(result.write.data.show_labor_total, false);
assert.equal(result.write.data.organization_id, 'org');
assert.equal(result.write.data.company_id, 'current-company');
assert.ok(result.calls.some(c => c.table === 'company_settings' && c.filter?.[0] === 'organization_id' && c.filter[1] === 'org'));
result = await saveCase({ existing: { id: 'legacy', created_by: 'creator', company_id: null, is_personal: true, is_default: false } });
assert.equal(result.write.operation, 'update');
for (const key of ['organization_id', 'company_id', 'created_by', 'is_personal', 'is_default', 'color_scheme']) assert.ok(!(key in result.write.data), `${key} remains immutable on updates`);
result = await saveCase({ personal: false });
assert.equal(result.calls.length, 0);
assert.match(result.notices[0], /administrators/);
result = await saveCase({ personal: false, admin: true });
assert.equal(result.write.data.is_personal, false);
result = await saveCase({ personal: false, admin: true, existing: { id: 'mine', created_by: 'creator', is_personal: true } });
assert.equal(result.write.operation, 'insert', 'Changing scope creates a new copy');
result = await saveCase({ hidePrices: true });
assert.equal(result.write.data.show_installed_price, false);
assert.equal(result.write.data.show_labor_total, false);
console.log('Actual builder handlers preserve independent model/SKU/color/installed/labor flags, enforce company permissions and preserve template ownership.');
