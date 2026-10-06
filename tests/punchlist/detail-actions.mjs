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
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText, {
    module, exports:module.exports, console, ...globals,
    require(name) { if (name === 'react') return react; if (name === 'react/jsx-runtime') return {jsx,jsxs:jsx,Fragment:'fragment'}; if (name === 'lucide-react') return new Proxy({}, {get:(_,key)=>key}); if (name in imports) return imports[name]; throw Error(name); },
  });
  return {render(props, exportName) { cursor=0; rendering=true; try { return module.exports[exportName](props); } finally {rendering=false;} }, effects};
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree,...nodes(tree.props?.children)]; }
function text(tree) { if (Array.isArray(tree)) return tree.map(text).join(''); if (!tree || typeof tree !== 'object') return tree == null ? '' : String(tree); return text(tree.props?.children); }

const task={id:'item',title:'Check audio',details:'Pool system does not work',customer_notes:null,installer_notes:null,status:'draft',created_at:'2026-10-05',requested_at:null,completed_at:null,service_request_id:null,work_order_id:null};
let scheduled=0,requested=0;
function render(overrides={},admin=true){const h=harness('src/components/Portal/PunchlistTaskDetailModal.tsx',{}, {'../../lib/punchlist':{punchlistDescription:task=>task.details||task.title},'../../lib/supabase':{supabase:{}}});return h.render({task:{...task,...overrides},isAdmin:admin,onClose(){},onTaskUpdated(){},onSchedule:()=>scheduled++,onRequestService:()=>requested++,onDelete(){},onMarkComplete(){}},'PunchlistTaskDetailModal');}
const buttons=tree=>nodes(tree).filter(n=>n.type==='button');
let tree=render();buttons(tree).find(n=>text(n)==='Schedule').props.onClick();buttons(tree).find(n=>text(n)==='Request Service').props.onClick();assert.equal(scheduled,1);assert.equal(requested,1);
assert.ok(buttons(tree).find(n=>text(n)==='Mark Complete'));
tree=render({status:'requested',service_request_id:'sr',service_request:{id:'sr',status:'open',work_order_id:null}});assert.ok(buttons(tree).some(n=>text(n)==='Schedule'));assert.ok(!buttons(tree).some(n=>text(n)==='Request Service'));
tree=render({status:'scheduled',work_order_id:'wo'});assert.ok(!buttons(tree).some(n=>text(n)==='Schedule'||text(n)==='Request Service'));
tree=render({},false);assert.ok(!buttons(tree).some(n=>text(n)==='Schedule'||text(n)==='Request Service'));
console.log('Detail footer actions, requested/scheduled states, and staff-only action visibility passed.');
