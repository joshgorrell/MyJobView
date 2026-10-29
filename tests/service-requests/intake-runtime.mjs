import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(path, globals = {}, imports = {}) {
  let rendering = false, cursor = 0;
  const values = [], deps = [], effects = [];
  const hook = () => { assert.ok(rendering, 'Hooks must run during render, never inside effects'); return cursor++; };
  const react = {
    useState(initial) { const i = hook(); if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }]; },
    useRef(initial) { const i = hook(); return values[i] ||= {current: initial}; },
    useCallback(fn, next) { const i = hook(); if (!deps[i] || next.some((v,j) => v !== deps[i][j])) { deps[i] = next; values[i] = fn; } return values[i]; },
    useId() { return `test-${hook()}`; },
    useEffect(fn, next) { const i = hook(); if (!deps[i] || next.some((v,j) => v !== deps[i][j])) { deps[i] = next; effects.push(fn); } },
  };
  const jsx = (type, props) => ({type, props});
  const module = {exports: {}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText, {
    module, exports:module.exports, console, ...globals,
    require(name) {
      if (name.endsWith('/ServiceApprovalPanel')) return {ServiceApprovalPanel:'ApprovalPanel'};
      if (name.endsWith('/serviceApproval')) return {sendServiceApproval:async()=>{},serviceApprovalPending:r=>!!r.service_approval_required&&!r.service_waived_at&&(!r.service_accepted_at||!r.service_payment_method_id)};
      if (name.endsWith('.css')) return {};
      if (name.endsWith('/feedback')) return {
        notify(message, options) { if (options?.tone === 'error' || options?.tone === 'warning') { if (globals.alert) globals.alert(message); else throw Error(message); } },
        async requestConfirmation(message) { const decision = globals.confirm || globals.window?.confirm; if (!decision) throw Error('Confirmation fixture required: ' + message); return decision(message); },
        async requestText(message, initial) { const decision = globals.prompt || globals.window?.prompt; if (!decision) throw Error('Text-entry fixture required: ' + message); return decision(message, initial); },
      };
      if (name === 'react') return react; if (name === 'react/jsx-runtime') return {jsx,jsxs:jsx,Fragment:'fragment'}; if (name === 'lucide-react') return new Proxy({}, {get:(_,key)=>key}); if (name in imports) return imports[name]; throw Error(name); },
  });
  return {render(props, exportName) { cursor=0; rendering=true; try { return module.exports[exportName](props); } finally {rendering=false;} }, effects};
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree,...nodes(tree.props?.children)]; }
function text(tree) { if (Array.isArray(tree)) return tree.map(text).join(''); if (!tree || typeof tree !== 'object') return tree == null ? '' : String(tree); return text(tree.props?.children); }

const calls=[];
const supabase={from(table){let value;const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:()=>q,or:()=>q,insert:payload=>{value=payload;calls.push([table,payload]);return q;},single:async()=>({data:table==='contacts'?{id:'customer',full_name:'John'}:{id:'saved'},error:null}),then:resolve=>Promise.resolve({data:[],error:null}).then(resolve)};return q;}};
const h=harness('src/components/Service/ServiceRequestForm.tsx',{navigator:{onLine:true},setTimeout:()=>0,clearTimeout(){},alert:msg=>{throw Error(msg);}}, {'../../lib/supabase':{supabase},'../../contexts/AuthContext':{useAuth:()=>({profile:{id:'staff',role:'sales'}})},'../Shared/AddressAutocomplete':{AddressAutocomplete:'Address'},'../Shared/QuickActionModal':{QuickActionModal:'Modal'},'../Shared/AIFormFill':{AIFormFill:'AIFormFill'}});
const props={onClose(){},aiPrefill:{contactId:'customer',customerName:'John',jobDescription:'TV sound'}};
let tree=h.render(props,'ServiceRequestForm');for(const effect of h.effects.splice(0))effect();await new Promise(setImmediate);tree=h.render(props,'ServiceRequestForm');
const render=()=>tree=h.render(props,'ServiceRequestForm');
assert.ok(!nodes(tree).some(n=>n.type==='button'&&text(n).includes('Found')));
const fillWithAI = prefill => { nodes(tree).find(n=>n.type==='AIFormFill').props.onFill(prefill); render(); };
const priority = () => nodes(tree).find(n=>n.props?.['aria-label']==='Priority').props.value;
fillWithAI({priority:'critical'}); assert.equal(priority(),'normal','Unknown AI priority preserves the current selection');
fillWithAI({priority:'urgent'}); assert.equal(priority(),'urgent','Supported AI priority is applied');
fillWithAI({priority:'high'}); assert.equal(priority(),'urgent','Invalid AI values cannot replace a chosen priority');
const change=(label,value)=>{nodes(tree).find(n=>n.props?.['aria-label']===label).props.onChange({target:{value}});render();};
const internalSchedulingLabel=nodes(tree).find(n=>n.type==='label'&&text(n).includes('Message to Scheduling (Internal Only)'));
assert.ok(internalSchedulingLabel,'Scheduling notes must be visibly identified as internal');
const schedulingMessage=nodes(tree).find(n=>n.type==='textarea'&&n.props.placeholder?.includes('Customer is out of town'));
assert.ok(schedulingMessage,'Internal scheduling message field exists');
schedulingMessage.props.onChange({target:{value:'INTERNAL ONLY: do not share with customer'}});render();
change('Billing type','warranty');change('Warranty reference','Project 101');change('Warranty reason','Return visit');change('Customer contact responsibility','requester');nodes(tree).find(n=>n.type==='input'&&n.props.name==='request-scheduling'&&!n.props.checked).props.onChange();render();const earliest = new Date(); earliest.setDate(earliest.getDate() + 2);
const needByDate = new Date(); needByDate.setDate(needByDate.getDate() + 4);
const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
change('Earliest date', localDate(earliest));
const needBy=nodes(tree).find(n=>n.type==='input'&&n.props['aria-label']==='Need by');needBy.props.onChange({target:{value:localDate(needByDate)}});render();
await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
const request=calls.find(c=>c[0]==='service_requests')[1];assert.equal(request.notes,'INTERNAL ONLY: do not share with customer','Internal scheduling message is persisted on service request only');assert.equal(request.earliest_date,localDate(earliest));assert.equal(request.requested_date,localDate(needByDate));assert.equal(request.customer_contact_instruction,'requester');assert.equal(request.warranty_reference,'Project 101');assert.equal(request.warranty_notes,'Return visit');assert.equal(request.job_location_address,'');assert.equal(request.billable_by,'assigned_sales_rep');assert.equal(request.priority,'urgent');
console.log('Fast intake submits without mandatory address and preserves scheduling/warranty context.');

// Regression: the scheduling-only message must never enter customer OR technician work-order notes.
const combinedQueueSource=fs.readFileSync('src/components/Dispatch/ServiceRequestQueue.tsx','utf8');
assert.doesNotMatch(combinedQueueSource,/p_internal_notes:\s*serviceRequests\.map\(sr\s*=>\s*\[sr\.notes/,'Combined scheduling must not copy request messages into work-order notes');
assert.doesNotMatch(fs.readFileSync('src/components/Production/CreateWorkOrderModal.tsx','utf8'),/internal_notes:\s*serviceRequest\s*\?\s*\[serviceRequest\.notes/,'Individual scheduling must not copy request messages into work-order notes');
// Regression: internal scheduling notes must not prefill customer-visible work-order descriptions.
const workOrderSource=fs.readFileSync('src/components/Production/CreateWorkOrderModal.tsx','utf8');
assert.match(workOrderSource,/notes:\s*'',\s*internal_notes:\s*serviceRequest\s*\?/,'Work-order conversion must initialize customer notes empty and retain separate internal metadata');
assert.doesNotMatch(workOrderSource,/notes:\s*serviceRequest\?\.notes/,'Scheduling notes must never populate customer-visible work-order notes');
console.log('Service scheduling message is isolated from customer and technician work-order notes.');

const approvalEmailSource=fs.readFileSync('supabase/functions/send-service-approval/index.ts','utf8');
assert.doesNotMatch(approvalEmailSource,/attempt\.notes|serviceRequest\.notes|request\.notes/,'Customer approval email must never interpolate scheduling notes');
assert.match(approvalEmailSource,/attempt\.description/,'Customer approval email uses approved service description');
