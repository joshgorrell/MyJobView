import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(path, globals = {}, imports = {}) {
  let rendering = false, cursor = 0;
  const values = [], deps = [], effects = [];
  const hook = () => { assert.ok(rendering, 'Hooks must run during render, never inside effects'); return cursor++; };
  const react = { lazy: () => "Scheduler", Suspense: "Suspense",
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

const library={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/punchlist.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:library,exports:library.exports});
const rows=[['old','a','Alpha','2026-10-01','draft'],['new','b','Beta','2026-10-05','draft'],['second','a','Alpha','2026-10-03','draft'],['requested','a','Alpha','2026-10-02','requested']].map(([id,contact_id,name,created_at,status])=>({id,contact_id,created_at,status,title:id,details:id+' item',contact:{full_name:name,email:name+'@example.com',phone:'123'},service_request_id:status==='requested'?'existing':null,service_request:status==='requested'?{status:'open',work_order_id:null}:null}));
const requests={existing:{id:'existing',contact_id:'a',status:'open'}};
const calls=[];
const supabase={channel:()=>({on(){return this;},subscribe:()=>({unsubscribe(){}})}),from(table){let id;const q={select:()=>q,order:()=>q,eq:(k,v)=>{id=v;return q;},single:async()=>({data:requests[id],error:null}),then:resolve=>Promise.resolve({data:rows,error:null}).then(resolve)};return q;},rpc:async(name,args)=>{calls.push([name,args]);const id='sr-'+args.p_contact_id;requests[id]={id,contact_id:args.p_contact_id,status:'open',work_order_id:null};return{data:id,error:null};}};
const toast={warning:msg=>calls.push(['warning',msg]),error:msg=>calls.push(['error',msg]),success(){}};
const h=harness('src/components/Production/PunchlistAdminDashboard.tsx',{}, {
 '../../lib/punchlist':library.exports,'../../lib/supabase':{supabase},'../../contexts/AuthContext':{useAuth:()=>({profile:{id:'admin'},loading:false})},
 '../Shared/Toast':{useToast:()=>toast},'../../hooks/usePunchlistUnseenCount':{markPunchlistSeen(){}},'./PunchlistInviteManager':{PunchlistInviteManager:'Invites'},'../Portal/PunchlistTaskDetailModal':{PunchlistTaskDetailModal:'Details'},'../Shared/ContactQuickViewModal':{ContactQuickViewModal:'Contact'},
});
let tree=h.render({},'PunchlistAdminDashboard');for(const effect of h.effects.splice(0))effect();await new Promise(r=>setTimeout(r,0));tree=h.render({},'PunchlistAdminDashboard');
const boxes=()=>nodes(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox');
const button=(name)=>nodes(tree).find(n=>n.type==='button'&&(n.props['aria-label']===name||text(n)===name));
const control=name=>nodes(tree).find(n=>n.props?.['aria-label']===name);
const render=()=>{tree=h.render({},'PunchlistAdminDashboard');};
assert.deepEqual(boxes().map(n=>n.props['aria-label']),['Select new item','Select second item','Select requested item','Select old item']);
assert.equal(button('Select all visible items for this customer').props.disabled,true);
boxes()[1].props.onChange();render();assert.equal(boxes()[0].props.disabled,true);
button('Select all visible items for this customer').props.onClick();render();assert.equal(boxes().filter(n=>n.props.checked).length,3);
assert.equal(button('Request Service').props.disabled,true);
button('Clear selection').props.onClick();render();assert.equal(boxes()[0].props.disabled,false);
control('Punchlist order').props.onChange({target:{value:'customer'}});render();assert.equal(boxes()[0].props['aria-label'],'Select second item');
control('Search punchlist items').props.onChange({target:{value:'Beta'}});render();assert.equal(boxes().length,1);
boxes()[0].props.onChange();render();assert.equal(button('Request Service').props.disabled,false);
button('Request Service').props.onClick();render();let batch=nodes(tree).find(n=>typeof n.type==='function'&&n.type.name==='BatchRequestModal');assert.equal(batch.props.tasks.length,1);assert.equal(batch.props.tasks[0].contact_id,'b');
// Exercise the actual nested batch component by using its captured function in a hook renderer.
let completed=false,scheduled;
function runBatch(props){const source=fs.readFileSync('src/components/Production/PunchlistAdminDashboard.tsx','utf8')+'\nexport {BatchRequestModal};';
 const original=fs.readFileSync;fs.readFileSync=(path,...args)=>path==='batch.tsx'?source:original(path,...args);try{return harness('batch.tsx',{}, {'../../lib/punchlist':library.exports,'../../lib/supabase':{supabase},'../../contexts/AuthContext':{},'../Shared/Toast':{useToast:()=>toast},'../../hooks/usePunchlistUnseenCount':{},'./PunchlistInviteManager':{},'../Portal/PunchlistTaskDetailModal':{},'../Shared/ContactQuickViewModal':{}}).render(props,'BatchRequestModal');}finally{fs.readFileSync=original;}}
let batchTree=runBatch({tasks:[rows[1]],mode:'request',onSuccess:()=>{completed=true;},onClose(){},onSchedule(){}});
await nodes(batchTree).find(n=>n.type==='button'&&text(n)==='Request Service (1)').props.onClick();assert.ok(completed);assert.deepEqual(Array.from(calls.find(c=>c[0]==='request_punchlist_service')[1].p_task_ids),['new']);
batchTree=runBatch({tasks:[rows[3]],mode:'schedule',onSuccess(){},onClose(){},onSchedule:requests=>{scheduled=requests;}});
await nodes(batchTree).find(n=>n.type==='button'&&text(n)==='Continue to Schedule').props.onClick();assert.equal(scheduled[0].id,'existing');assert.equal(calls.filter(c=>c[0]==='request_punchlist_service').length,1);
batchTree=runBatch({tasks:[rows[0],rows[1]],mode:'schedule',onSuccess(){},onClose(){},onSchedule(){throw Error('Mixed customers must not schedule');}});
await nodes(batchTree).find(n=>n.type==='button'&&text(n)==='Continue to Schedule').props.onClick();assert.ok(calls.some(c=>c[0]==='error'&&c[1].includes('one customer')));
console.log('Newest/customer/search, visible selection, customer lock, request grouping, existing-request scheduling, and mixed-customer guard passed.');
