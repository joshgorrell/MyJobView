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

const calls=[];
const supabase={from(table){let value;const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:()=>q,or:()=>q,insert:payload=>{value=payload;calls.push([table,payload]);return q;},single:async()=>({data:table==='contacts'?{id:'customer',full_name:'John'}:{id:'saved'},error:null}),then:resolve=>Promise.resolve({data:[],error:null}).then(resolve)};return q;}};
const h=harness('src/components/Service/ServiceRequestForm.tsx',{navigator:{onLine:true},setTimeout:()=>0,clearTimeout(){},alert:msg=>{throw Error(msg);}}, {'../../lib/supabase':{supabase},'../../contexts/AuthContext':{useAuth:()=>({profile:{id:'staff',role:'sales'}})},'../Shared/AddressAutocomplete':{AddressAutocomplete:'Address'},'../Shared/QuickActionModal':{QuickActionModal:'Modal'}});
const props={onClose(){},aiPrefill:{contactId:'customer',customerName:'John',jobDescription:'TV sound'}};
let tree=h.render(props,'ServiceRequestForm');for(const effect of h.effects.splice(0))effect();await new Promise(setImmediate);tree=h.render(props,'ServiceRequestForm');
const render=()=>tree=h.render(props,'ServiceRequestForm');
assert.ok(!nodes(tree).some(n=>n.type==='button'&&text(n).includes('Found')));
const change=(label,value)=>{nodes(tree).find(n=>n.props?.['aria-label']===label).props.onChange({target:{value}});render();};
change('Billing type','warranty');change('Warranty reference','Project 101');change('Warranty reason','Return visit');change('Customer contact responsibility','requester');nodes(tree).find(n=>n.type==='input'&&n.props.name==='request-scheduling'&&!n.props.checked).props.onChange();render();change('Earliest date','2026-10-08');
const needBy=nodes(tree).find(n=>n.type==='input'&&n.props['aria-label']==='Need by');needBy.props.onChange({target:{value:'2026-10-10'}});render();
await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
const request=calls.find(c=>c[0]==='service_requests')[1];assert.equal(request.earliest_date,'2026-10-08');assert.equal(request.requested_date,'2026-10-10');assert.equal(request.customer_contact_instruction,'requester');assert.equal(request.warranty_reference,'Project 101');assert.equal(request.warranty_notes,'Return visit');assert.equal(request.job_location_address,'');assert.equal(request.billable_by,'assigned_sales_rep');
console.log('Fast intake submits without mandatory address and preserves scheduling/warranty context.');
