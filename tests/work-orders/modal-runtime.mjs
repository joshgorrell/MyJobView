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
    useId() { return `test-${hook()}`; },
    useEffect(fn, next) { const i = hook(); if (!deps[i] || next.some((v,j) => v !== deps[i][j])) { deps[i] = next; effects.push(fn); } },
  };
  const jsx = (type, props) => ({type, props});
  const module = {exports: {}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText, {
    module, exports:module.exports, console, ...globals,
    require(name) { if (name === 'react') return react; if (name === 'react/jsx-runtime') return {jsx,jsxs:jsx,Fragment:'fragment'}; if (name === 'lucide-react') return new Proxy({}, {get:(_,key)=>key}); if (name in imports) return imports[name]; throw Error(name); },
  });
  return {render(props, exportName) { cursor=0; rendering=true; try { return module.exports[exportName](props); } finally {rendering=false;} }, effects};
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree,...nodes(tree.props?.children)]; }
function text(tree) { if (Array.isArray(tree)) return tree.map(text).join(''); if (!tree || typeof tree !== 'object') return tree == null ? '' : String(tree); return text(tree.props?.children); }
for (const hasViewport of [true,false]) {
  let restoredFocus=false, dialogFocus=false;
  const listeners = new Map();
  const body={style:{overflow:'auto',position:'',top:'',width:''}};
  const window={scrollY:123,scrollTo(x,y){assert.equal(y,123);},visualViewport:hasViewport ? {offsetTop:10,height:450,addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}} : undefined};
  const h=harness('src/components/Shared/QuickActionModal.tsx',{window,document:{body,activeElement:{isConnected:true,focus(){restoredFocus=true;}}}});
  const tree=h.render({title:'Test',icon:null,onClose(){},children:'Fields'},'QuickActionModal');
  for (const node of nodes(tree)) if(node.props?.ref) node.props.ref.current={focus(){dialogFocus=true;}};
  const cleanups=h.effects.splice(0).map(fn=>fn());
  assert.equal(body.style.position,'fixed'); assert.ok(dialogFocus);
  if(hasViewport) { assert.equal(listeners.size,2); window.visualViewport.height=300; listeners.get('resize')(); }
  for(const cleanup of cleanups.reverse()) cleanup?.();
  assert.equal(listeners.size,0); assert.equal(body.style.overflow,'auto'); assert.ok(restoredFocus);
}
const fixture={project_tasks:[
  {id:'assigned',project_id:'p',labor_phase_id:'rough',title:'Assigned install',status:'open',labor_phase:{name:'Rough-in'}},
  {id:'reference',project_id:'p',labor_phase_id:'rough',title:'Other rough work',status:'open',labor_phase:{name:'Rough-in'}},
  {id:'other-phase',project_id:'p',labor_phase_id:'trim',title:'Trim work',status:'open',labor_phase:{name:'Trim'}},
  {id:'finished',project_id:'p',labor_phase_id:'rough',title:'Finished work',status:'completed'},
  {id:'cancelled',project_id:'p',labor_phase_id:'rough',title:'Cancelled work',status:'cancelled'},
],work_order_tasks:[{id:'wo-task',work_order_id:'wo',project_task_id:'assigned',title:'Assigned install'}],work_order_task_completions:[]};
const inserted=[];
const supabase={from(table){const predicates=[];let mutation;const query={select(){return query;},eq(key,value){predicates.push(row=>row[key]===value);return query;},order(){return query;},insert(value){mutation=value;return query;},then(resolve){if(mutation)inserted.push(mutation);return Promise.resolve({data:(fixture[table]||[]).filter(row=>predicates.every(test=>test(row))),error:null}).then(resolve);}};return query;},channel(){const channel={on(){return channel;},subscribe(){return channel;},unsubscribe(){}};return channel;}};
const h=harness('src/components/Production/WorkOrderTasksChecklist.tsx',{}, {'../../lib/supabase':{supabase}});
const props={workOrderId:'wo',projectId:'p',laborPhaseId:'rough',currentUserId:'tech'};
async function settle(){for(const fn of h.effects.splice(0)) fn();for(let i=0;i<8;i++)await new Promise(setImmediate);return h.render(props,'default');}
h.render(props,'default');let tree=await settle();
assert.equal(text(tree).split('Assigned install').length-1,1,'Assigned project task must not appear twice');
assert.ok(text(tree).includes('Other rough work'));assert.ok(!text(tree).includes('Trim work'));assert.ok(!text(tree).includes('Finished work'));assert.ok(!text(tree).includes('Cancelled work'));
const references=nodes(tree).find(node=>node.type==='ul');assert.ok(!nodes(references).some(node=>node.type==='button'),'Reference tasks cannot be completed as assigned work');
nodes(tree).find(node=>node.type==='button'&&text(node).includes('Browse all phases')).props.onClick();h.render(props,'default');tree=await settle();assert.ok(text(tree).includes('Trim work'));
nodes(tree).find(node=>node.type==='button'&&node.props['aria-label']?.includes('Assigned install')).props.onClick();tree=h.render(props,'default');await nodes(tree).find(node=>node.type==='button'&&text(node)==='Complete').props.onClick();assert.equal(inserted[0].work_order_task_id,'wo-task');assert.equal(inserted[0].work_order_id,'wo');assert.equal(inserted[0].project_task_id,undefined);
console.log('Work order task scope and modal lifecycle tests passed.');
