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

const people=[{id:'owner',full_name:'Josh',role:'admin',is_active:true,is_technician:false,is_sales_rep:false},{id:'security',full_name:'Bobbi',role:'service_manager',is_active:true,is_technician:false,is_sales_rep:true},{id:'tech',full_name:'Installer',role:'manager',is_active:true,is_technician:true,is_sales_rep:false},{id:'both',full_name:'Both',role:'finance',is_active:true,is_technician:true,is_sales_rep:true},{id:'inactive',full_name:'Inactive',role:'tech',is_active:false,is_technician:true,is_sales_rep:true}];
const supabase={from(table){const predicates=[];const q={select(){return q},order(){return q},in(k,v){predicates.push(r=>v.includes(r[k]));return q},eq(k,v){predicates.push(r=>r[k]===v);return q},then(resolve){return Promise.resolve({data:(table==='profiles'?people:[]).filter(r=>predicates.every(p=>p(r))),error:null}).then(resolve)}};return q},channel(){const q={on(){return q},subscribe(){return q},unsubscribe(){}};return q}};
const h=harness('src/components/Production/WorkOrdersList.tsx',{setTimeout(){return 1},clearTimeout(){}},{'../../lib/supabase':{supabase},'../../contexts/AuthContext':{useAuth:()=>({profile:people[0]})},'../../lib/workOrderOptions':{useWorkOrderOptions:()=>[],workOrderOptionLabel:()=>'',workOrderOptionStyle:()=>undefined},'./CreateWorkOrderModal':{CreateWorkOrderModal:()=>null}});
h.render({},'WorkOrdersList');for(const fn of h.effects.splice(0))fn();for(let i=0;i<8;i++)await new Promise(setImmediate);
let tree=h.render({},'WorkOrdersList');nodes(tree).find(n=>n.type==='button'&&text(n).includes('Filters')).props.onClick();tree=h.render({},'WorkOrdersList');
const labels=nodes(tree).filter(n=>n.type==='label').map(text);
assert.ok(!labels.some(s=>s.includes('Josh')||s.includes('Inactive')));
assert.equal(labels.filter(s=>s.includes('Installer')).length,1);
assert.equal(labels.filter(s=>s.includes('Bobbi')).length,1);
assert.equal(labels.filter(s=>s.includes('Both')).length,2);
console.log('Work Orders technician/sales filters honor independent designations and active accounts.');
