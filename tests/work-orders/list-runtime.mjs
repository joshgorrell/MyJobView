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

let failure = false, timer;
const supabase = {from(table) { const q = {select(){return q},in(){return q},order(){return q},eq(){return q},then(resolve,reject){if(failure && table==='work_orders') return new Promise(()=>{}).then(resolve,reject);return Promise.resolve({data:table==='work_orders'?[{id:'wo',title:null,work_order_number:null,project:{name:null,customer_name:null},status:'pending',priority:'low'}]:[],error:null}).then(resolve,reject)}};return q},channel(){const q={on(){return q},subscribe(){return q},unsubscribe(){}};return q}};
const h=harness('src/components/Production/WorkOrdersList.tsx',{setTimeout(fn){timer=fn;return 1},clearTimeout(){}},{'../../lib/supabase':{supabase},'../../contexts/AuthContext':{useAuth:()=>({profile:{id:'admin',role:'admin'}})},'../../lib/workOrderOptions':{useWorkOrderOptions:()=>[],workOrderOptionLabel:()=>'',workOrderOptionStyle:()=>undefined},'./CreateWorkOrderModal':{CreateWorkOrderModal:()=>null}});
h.render({},'WorkOrdersList'); for(const fn of h.effects.splice(0))fn();
for(let i=0;i<8;i++)await new Promise(setImmediate);
let tree=h.render({},'WorkOrdersList');assert.ok(text(tree).includes('1 of 1 work order'),'Nullable record renders');
failure=true;nodes(tree).find(n=>n.type==='button'&&n.props.title?.startsWith('Newest first')).props.onClick();h.render({},'WorkOrdersList');for(const fn of h.effects.splice(0))fn();timer();
for(let i=0;i<8;i++)await new Promise(setImmediate);
tree=h.render({},'WorkOrdersList');assert.ok(text(tree).includes('took too long'));failure=false;nodes(tree).find(n=>n.type==='button'&&text(n)==='Retry').props.onClick();for(let i=0;i<8;i++)await new Promise(setImmediate);tree=h.render({},'WorkOrdersList');assert.ok(text(tree).includes('1 of 1 work order'));console.log('Nullable work orders, request timeout and retry passed.');
