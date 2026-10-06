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
    require(name) { if (name === 'react') return react; if (name === 'react/jsx-runtime') return {jsx,jsxs:jsx,Fragment:'fragment'}; if (name === 'lucide-react') return new Proxy({}, {get:(_,key)=>key}); if (name in imports) return imports[name]; throw Error(name); },
  });
  return {render(props, exportName) { cursor=0; rendering=true; try { return module.exports[exportName](props); } finally {rendering=false;} }, effects};
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree,...nodes(tree.props?.children)]; }
function text(tree) { if (Array.isArray(tree)) return tree.map(text).join(''); if (!tree || typeof tree !== 'object') return tree == null ? '' : String(tree); return text(tree.props?.children); }

const profile={id:'manager',role:'service_manager'};
const requests=[{id:'one',customer_name:'Customer With A Very Long Name',contact_id:'c1',created_at:'2026-10-05',status:'open',job_description:'Pool sound needs attention',source_type:'punchlist',priority:'normal',billable_type:'warranty',created_by:'manager',profiles:{full_name:'Long Staff Name'},attachments:[],requested_tech_ids:[]},{id:'two',customer_name:'Other Customer',contact_id:'c2',created_at:'2026-10-05',status:'open',job_description:'Check audio',source_type:'staff_form',priority:'normal',billable_type:'billable',created_by:'manager',attachments:[],requested_tech_ids:[]}];
const supabase={channel:()=>({on(){return this;},subscribe(){return{unsubscribe(){}};}}),from(table){const q={select:()=>q,eq:()=>q,not:()=>q,order:()=>q,then:resolve=>Promise.resolve({data:table==='service_requests'?requests:[],error:null}).then(resolve)};return q;}};
const h=harness('src/components/Dispatch/ServiceRequestQueue.tsx',{alert:msg=>{throw Error(msg);}}, {
 '../../lib/dispatchNotifications':{notifyTechJobAssigned(){}},'../Shared/SchedulingCalendar':{SchedulingCalendar:'Calendar'},'../../lib/supabase':{supabase},'../../contexts/AuthContext':{useAuth:()=>({profile,loading:false})},'../Production/CreateWorkOrderModal':{CreateWorkOrderModal:'Scheduler'},'../ui/ConfirmModal':{default:'Confirm'},'../Service/ServiceRequestForm':{ServiceRequestForm:'RequestForm'},'../Shared/ContactQuickViewModal':{ContactQuickViewModal:'Contact'},
});
let tree=h.render({},'ServiceRequestQueue');for(const effect of h.effects.splice(0))effect();await new Promise(resolve=>setTimeout(resolve,0));const render=()=>{tree=h.render({},'ServiceRequestQueue');};render();
const button=name=>nodes(tree).find(n=>n.type==='button'&&(n.props['aria-label']===name||text(n)===name));
assert.equal(nodes(tree).filter(n=>n.props?.['data-testid']?.startsWith('service-request-')).length,2);
button('Expand request').props.onClick({stopPropagation(){}});render();assert.ok(text(tree).includes('Full Description'));assert.ok(button('Collapse request'));assert.ok(button('Schedule Work Order'));
button('Schedule Work Order').props.onClick({stopPropagation(){}});render();let scheduler=nodes(tree).find(n=>n.type==='Scheduler');assert.equal(scheduler.props.serviceRequest.id,'one');assert.equal(scheduler.props.serviceRequest.contact_id,'c1');scheduler.props.onClose();render();
button('Collapse request').props.onClick({stopPropagation(){}});render();
const checkboxes=()=>nodes(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox');checkboxes()[0].props.onChange({stopPropagation(){}});render();assert.equal(checkboxes().length,1,'Other customer must not be selectable for a combined work order');
button('Filters').props.onClick();render();assert.equal(nodes(tree).filter(n=>n.type==='select').length,2);
console.log('Queue expansion, direct scheduling handoff, filters, and single-customer selection preserved.');
