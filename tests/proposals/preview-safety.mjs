import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import vm from 'node:vm';

const source = await readFile('src/components/Portal/PortalProposalDetail.tsx', 'utf8');
const { code } = await transform(source, { loader: 'tsx', jsx: 'transform', define: { 'import.meta.env': '{}' } });
// Execute the real action handlers with preview enabled. Any access to browser,
// database, modal state, or proposal data throws, exposing an escaped guard.
for (const name of ['trackProposalView', 'trackProposalDownload', 'handleApprove', 'handleInvoicePayment', 'handleDecline', 'handleSubmitChangeRequest']) {
  const start = code.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const open = code.indexOf('{', start);
  let depth = 1, end = open + 1;
  while (depth && end < code.length) {
    if (code[end] === '{') depth++;
    if (code[end] === '}') depth--;
    end++;
  }
  const blocked = new Proxy({}, { get() { throw new Error('Preview attempted a side effect'); } });
  const context = vm.createContext({ previewMode: true, supabase: blocked, window: blocked });
  await vm.runInContext(`${code.slice(start, end)}; ${name}();`, context);
  console.log(`${name}: blocked in preview`);
}
assert.match(source, /!previewMode && showApprovalModal/);
assert.match(source, /!previewMode && showQA/);
assert.match(source, /!previewMode && showReactivationModal/);
assert.doesNotMatch(source, /setEditingScopeRoom/);
console.log('Customer mutation modals and scope editing cannot mount in preview');
