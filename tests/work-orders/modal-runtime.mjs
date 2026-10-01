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
const fixture={work_order_tasks:[{id:'visit-a',work_order_id:'wo',project_task_id:'master-a',title:'Issued title',description:'Issued instruction',status:'pending',estimated_hours:0,visit_instructions:'Rough-in only'}],project_task_activity:[]};
const packet={name:'Project',sold_handoff:{captured_at:'2026-10-01T00:00:00Z',overall_scope:'Original overall scope',rooms:[{id:'room',name:'Bedroom',description:'Original room scope'}],equipment:[]},tasks:[{id:'master-a',title:'Current master instruction',description:'Install bedroom TV',status:'open',progress_status:'partial',estimated_hours:0},{id:'finished',title:'Finished work',status:'completed',progress_status:'completed',estimated_hours:1}],history:[{id:'old-visit',project_task_id:'master-a',work_order_id:'previous-wo',work_order_task_id:'previous-assignment',disposition:'partial',notes:'Backing unfinished',technician_name:'Previous tech',created_at:'2026-09-30T00:00:00Z'}]};
const calls=[];
const supabase={from(table){const predicates=[];const query={select(){return query;},eq(key,value){predicates.push(row=>row[key]===value);return query;},order(){return query;},then(resolve){return Promise.resolve({data:(fixture[table]||[]).filter(row=>predicates.every(test=>test(row))),error:null}).then(resolve);}};return query;},async rpc(name,args){if(name==='get_work_order_project_context')return {data:packet,error:null};calls.push({name,args});return {data:'update',error:null};},channel(){const channel={on(){return channel;},subscribe(){return channel;},unsubscribe(){}};return channel;}};
const h=harness('src/components/Production/WorkOrderTasksChecklist.tsx',{crypto:{randomUUID:()=>`event-${calls.length}`},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}}},{'../../lib/supabase':{supabase}});
const props={workOrderId:'wo',projectId:'project',currentUserId:'tech'};
async function settle(){for(const fn of h.effects.splice(0))fn();for(let i=0;i<8;i++)await new Promise(setImmediate);return h.render(props,'default');}
h.render(props,'default');let tree=await settle();
assert.ok(text(tree).includes("Today's Work"));assert.ok(text(tree).includes('Current master instruction'));assert.ok(text(tree).includes('Rough-in only'));assert.ok(text(tree).includes('Backing unfinished'),'Past visits must be visible');assert.ok(!text(tree).includes('Finished work'),'Unassigned project tasks stay out of today');
await nodes(tree).find(node=>node.type==='button'&&text(node)==='Finish my portion').props.onClick();tree=await settle();assert.equal(calls[0].args.p_assignment_id,'visit-a');assert.equal(calls[0].args.p_complete_project,false);
await nodes(tree).find(node=>node.type==='button'&&text(node)==='Complete entire project task').props.onClick();tree=await settle();assert.equal(calls[1].args.p_complete_project,true);
nodes(tree).find(node=>node.type==='button'&&text(node)==='Full Project').props.onClick();tree=h.render(props,'default');assert.ok(text(tree).includes('Finished work'));assert.ok(text(tree).includes('Original overall scope'));assert.ok(text(tree).includes('Original room scope'));
assert.ok(!nodes(tree).some(node=>node.type==='button'&&text(node).includes('Complete entire')),'Full project is reference, not unrelated assignment completion');
console.log('Work order task scope, progress, full project and modal lifecycle tests passed.');
