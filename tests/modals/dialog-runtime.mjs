import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(path, imports) {
  let cursor = 0;
  const values = [], deps = [], effects = [], errors = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return values[i] ||= { current: initial }; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, next) { const i = cursor++; if (!deps[i] || next.some((value, j) => value !== deps[i][j])) { deps[i] = next; effects.push(fn); } },
  };
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, crypto: { randomUUID: () => 'fixture-line' },
    console: { error(...args) { errors.push(args); } },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      if (name in imports) return imports[name];
      throw new Error(`Unmocked import: ${name}`);
    },
  });
  return {
    render(props, name) { cursor = 0; return module.exports[name](props); },
    async settle(props, name) {
      let tree;
      for (let i = 0; i < 4; i++) {
        tree = this.render(props, name);
        for (const effect of effects.splice(0)) effect();
        await new Promise(setImmediate);
      }
      assert.deepEqual(errors, [], 'Dialog effects must complete without runtime errors');
      return tree;
    },
  };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function text(tree) { if (Array.isArray(tree)) return tree.map(text).join(''); if (!tree || typeof tree !== 'object') return tree == null ? '' : String(tree); return text(tree.props?.children); }
const contact = { id: 'customer', first_name: 'Ada', last_name: 'Customer', full_name: 'Ada Customer', street_address: '123 Main St', city: 'Topeka', state: 'KS', zip_code: '66603', email: 'fixture@example.test' };
const file = { id: 'file', file_name: 'Plan.pdf', file_type: 'application/pdf', file_size: 1024, storage_path: 'fixture/plan.pdf', uploaded_at: '2026-10-16', uploaded_by: 'owner' };
const mutations = [];
const supabase = {
  from(table) {
    let single = false, deleting = false;
    const query = new Proxy({}, { get(_, key) {
      if (key === 'then') return (resolve, reject) => {
        if (deleting) mutations.push({ table, action: 'delete' });
        return Promise.resolve({ data: deleting ? null : single ? contact : table === 'file_attachments' ? [file] : [], error: null }).then(resolve, reject);
      };
      return () => { if (key === 'single' || key === 'maybeSingle') single = true; if (key === 'delete') deleting = true; return query; };
    } });
    return query;
  },
  storage: { from: () => ({ remove: async paths => { mutations.push({ paths }); return { error: null }; } }) },
};
const feedback = { notify() { throw new Error('Unexpected error feedback'); } };
const invoice = harness('src/components/Invoices/CreateInvoiceModal.tsx', {
  '../../lib/feedback': feedback, '../../lib/supabase': { supabase },
  '../../contexts/AuthContext': { useAuth: () => ({ companySettings: { id: 'company' } }) },
  '../../lib/utils': { formatCurrency: value => `$${value}` },
  '../../lib/taxCalculations': { computeInvoiceTax: () => ({ taxAmount: 0 }) },
  '../Products/ProductStatusNotice': { default: 'ProductStatusNotice' },
  '../Shared/ContactSearchSelect': { ContactSearchSelect: 'ContactSearchSelect' },
  '../Proposals/InlineProductSearch': { default: 'InlineProductSearch' },
  './InvoiceCatalogBrowser': { default: 'InvoiceCatalogBrowser' },
  '../Shared/TaxRulesBadge': { TaxRulesBadge: 'TaxRulesBadge' },
});
const invoiceProps = { contactId: 'customer', onClose() {}, onSuccess() {} };
let tree = await invoice.settle(invoiceProps, 'CreateInvoiceModal');
assert.ok(text(tree).includes('Ada Customer'));
assert.ok(text(tree).includes('123 Main St'));
nodes(tree).find(node => node.props?.title === 'Edit billing address').props.onClick();
tree = invoice.render(invoiceProps, 'CreateInvoiceModal');
nodes(tree).find(node => node.type === 'input' && node.props.placeholder === 'Billing name...').props.onChange({ target: { value: 'Customer Accounts' } });
tree = invoice.render(invoiceProps, 'CreateInvoiceModal');
assert.equal(nodes(tree).find(node => node.type === 'input' && node.props.placeholder === 'Billing name...').props.value, 'Customer Accounts');
assert.equal(mutations.length, 0, 'Editing billing details must not create or submit an invoice');

let deleted = 0;
const attachments = harness('src/components/FileUpload/FileAttachmentsList.tsx', {
  '../../lib/feedback': feedback, '../../lib/supabase': { supabase }, '../ui/ConfirmModal': { default: 'ConfirmModal' },
});
const attachmentProps = { contextType: 'proposal', contextId: 'proposal', canDelete: true, onFileDeleted: () => deleted++ };
tree = await attachments.settle(attachmentProps, 'FileAttachmentsList');
nodes(tree).find(node => node.props?.title === 'Delete').props.onClick();
tree = attachments.render(attachmentProps, 'FileAttachmentsList');
let confirmation = nodes(tree).find(node => node.type === 'ConfirmModal');
assert.equal(confirmation.props.isOpen, true);
assert.ok(confirmation.props.message.includes('Plan.pdf'));
assert.equal(mutations.length, 0, 'Opening confirmation must not delete anything');
confirmation.props.onCancel();
tree = attachments.render(attachmentProps, 'FileAttachmentsList');
assert.equal(nodes(tree).find(node => node.type === 'ConfirmModal').props.isOpen, false);
assert.equal(mutations.length, 0);
nodes(tree).find(node => node.props?.title === 'Delete').props.onClick();
tree = attachments.render(attachmentProps, 'FileAttachmentsList');
await nodes(tree).find(node => node.type === 'ConfirmModal').props.onConfirm();
assert.equal(mutations.length, 2, 'Confirmation removes the stored file and its attachment row');
assert.equal(deleted, 1);
console.log('Invoice billing state/editing and file-delete confirmation/cancel/complete pass without runtime errors.');
