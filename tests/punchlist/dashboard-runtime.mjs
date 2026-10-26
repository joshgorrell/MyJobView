import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(path, globals = {}, imports = {}) {
  let rendering = false, cursor = 0;
  const values = [], deps = [], effects = [];
  const hook = () => { assert.ok(rendering, 'Hooks must run during render, never inside effects'); return cursor++; };
  const react = { lazy: () => "Scheduler", Suspense: "Suspense",
    useState(initial) { const i = hook(); if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }]; },
    useRef(initial) { const i = hook(); return values[i] ||= {current: initial}; },
    useCallback(fn, next) { const i = hook(); if (!deps[i] || next.some((v,j) => v !== deps[i][j])) { deps[i] = next; values[i] = fn; } return values[i]; },
    useId() { return `test-${hook()}`; },
    useEffect(fn, next) { const i = hook(); if (!deps[i] || next.some((v,j) => v !== deps[i][j])) { deps[i] = next; effects.push(fn); } },
  };
  const jsx = (type, props) => ({type, props});
  const module = {exports: {}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText, {
    module, exports:module.exports, console, ...globals,
    require(name) { if (name === 'react') return react; if (name === 'react/jsx-runtime') return {jsx,jsxs:jsx,Fragment:'fragment'}; if (name === 'lucide-react') return new Proxy({}, {get:(_,key)=>key}); if (name === '../Shared/SupportPhotos') return {SupportPhotos: 'SupportPhotos'}; if (name in imports) return imports[name]; throw Error(name); },
  });
  return {render(props, exportName) { cursor=0; rendering=true; try { return module.exports[exportName](props); } finally {rendering=false;} }, effects};
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree,...nodes(tree.props?.children)]; }
function text(tree) { if (Array.isArray(tree)) return tree.map(text).join(''); if (!tree || typeof tree !== 'object') return tree == null ? '' : String(tree); return text(tree.props?.children); }

const projects=[{id:'p1',contact_id:'c1',customer:'Alpha',name:'Living room',number:'P1',can_submit:true,end_date:'2026-12-01',tasks:['a','b','c','d','e'].map(id=>({id,title:id,customer_description:id,visibility:'customer_visible',status:'open',request_id:null,photos:id==='a'?['org/contact/photo.jpg']:[]}))},{id:'p2',contact_id:'c1',customer:'Alpha',name:'Other project',can_submit:true,tasks:[{id:'other',title:'Other project',status:'open',request_id:null}]},{id:'p3',contact_id:'c2',customer:'Expired',name:'Old project',can_submit:false,tasks:[{id:'expired',title:'Expired adjustment',status:'open',request_id:null}]}];
const calls=[],listeners={};let fail=true;
const supabase={rpc:async(name,args)=>{if(name==='get_test_tune_workspace')return {data:JSON.parse(JSON.stringify(projects)),error:null};calls.push([name,args]);if(fail){fail=false;return {error:{message:'Network response lost'}};}for(const p of projects)for(const t of p.tasks)if(args.p_task_ids.includes(t.id))t.request_id='req1';return {data:'req1',error:null};},channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel(){}};
const window={innerWidth:1024,innerHeight:768,location:{search:'',href:'https://example.com/test-and-tune'},setInterval:()=>1,clearInterval(){},addEventListener:(n,f)=>listeners[n]=f,removeEventListener(){},history:{pushState(){}}};
const document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
const globals={window,document,URL,URLSearchParams,crypto:{randomUUID:()=>`submission-${calls.length}`}};
function make(){return harness('src/components/Production/TestTuneProjectAdjustments.tsx',globals,{'../../lib/supabase':{supabase},'../Shared/SupportPhotos':{SupportPhotos:()=>null}});}
const h=make();let tree;
const render=()=>tree=h.render({},'TestTuneProjectAdjustments');
const find=label=>nodes(tree).find(n=>n.props?.['aria-label']===label);
const button=label=>nodes(tree).find(n=>n.type==='button'&&text(n)===label);
render();for(const effect of h.effects.splice(0))effect();await new Promise(r=>setTimeout(r,0));render();
const previewTarget={getBoundingClientRect:()=>({left:120,bottom:130})};
find('Preview a').props.onClick({currentTarget:previewTarget});
render();
assert.ok(nodes(tree).some(n=>n.props?.role==='dialog'),'Preview opens as a fixed-position dialog outside the scroll table');
assert.ok(nodes(tree).some(n=>n.props?.paths?.includes('org/contact/photo.jpg')),'Staff preview receives attached customer photos');
find('Close punchlist preview').props.onClick();
render();
assert.ok(!nodes(tree).some(n=>n.props?.role==='dialog'),'Preview can be dismissed');
assert.equal(find('Select Expired adjustment').props.disabled,true);
for(const id of ['a','b','c']){find(`Select ${id}`).props.onChange({target:{checked:true}});render();}
assert.equal(find('Select Other project').props.disabled,true,'Selection locks to project even for the same customer');
button('Request service').props.onClick();await new Promise(r=>setTimeout(r,0));render();assert.ok(text(tree).includes('Network response lost'));
button('Request service').props.onClick();await new Promise(r=>setTimeout(r,0));render();
assert.deepEqual(Array.from(calls[1][1].p_task_ids),['a','b','c']);assert.equal(calls[0][1].p_submission_id,calls[1][1].p_submission_id,'Ambiguous retries retain idempotency reference');
assert.ok(!find('Select a'));assert.ok(find('Select d'));assert.ok(find('Select e'));
const originalRoute= listeners.popstate;const fresh=make();fresh.render({},'TestTuneProjectAdjustments');for(const effect of fresh.effects.splice(0))effect();await new Promise(r=>setTimeout(r,0));const reloaded=fresh.render({},'TestTuneProjectAdjustments');assert.ok(!nodes(reloaded).some(n=>n.props?.['aria-label']==='Select a'),'Fresh device uses persisted links, not session state');
window.location.search='?projectId=missing&contactId=c1';originalRoute();render();assert.ok(text(tree).includes('unavailable or you no longer have access'));
window.location.search='?contactId=c1&history=1&tuneStatus=requested';originalRoute();render();assert.equal(nodes(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox'&&n.props['aria-label']).length,0,'Requested history cannot select already submitted items');assert.ok(text(tree).includes('Requested'));assert.ok(!nodes(tree).filter(n=>n.type==='article').some(n=>text(n).includes('Other project')));
console.log('PASS: exactly three of five, project lock, expired block, stable retry key, persisted reload and unavailable route context.');
