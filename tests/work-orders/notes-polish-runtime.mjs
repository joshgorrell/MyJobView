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
function text(tree) { if (Array.isArray(tree)) return tree.map(text).join(''); if (!tree || typeof tree !== 'object') return tree == null || typeof tree === 'boolean' ? '' : String(tree); return text(tree.props?.children); }

let calls = 0, applied = [], response = {data:{cleaned:'Work Performed\nReplaced HDMI cable.'},error:null};
let resolve;
const api={functions:{async invoke(name,args){calls++;assert.equal(name,'ai-assistant');assert.equal(args.body.mode,'cleanup_work_order_notes');return response;}}};
const h=harness('src/components/Shared/NotesPolishButton.tsx',{AbortController},{'../../lib/supabase':{supabase:api},'./QuickActionModal':{QuickActionModal:'Modal'}});
const props={value:'replaced hdmi cable',onApply:value=>applied.push(value)};
const render=()=>h.render(props,'NotesPolishButton');
const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&(n.props['aria-label']===label||text(n)===label));
let tree=render();
button(tree,'Polish notes with AI').props.onClick();tree=render();
assert.equal(calls,0,'Opening confirmation must not call AI');
assert.equal(nodes(tree).find(n=>n.type==='Modal').props.title,'Polish your notes with AI?');
button(tree,'Cancel').props.onClick();assert.equal(calls,0);
tree=render();button(tree,'Polish notes with AI').props.onClick();tree=render();
button(tree,'Polish Notes').props.onClick();await new Promise(r=>setTimeout(r,0));tree=render();
assert.equal(calls,1);assert.deepEqual(applied,[],'Generation must never auto-save');
nodes(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Reviewed notes'}});tree=render();
props.value='newer edit';tree=render();assert.equal(button(tree,'Use These Notes').props.disabled,true,'Never overwrite newer notes');
props.value='replaced hdmi cable';tree=render();button(tree,'Use These Notes').props.onClick();assert.deepEqual(applied,['Reviewed notes']);
tree=render();button(tree,'Polish notes with AI').props.onClick();tree=render();
response={data:null,error:new Error('Unavailable')};button(tree,'Polish Notes').props.onClick();await new Promise(r=>setTimeout(r,0));tree=render();
assert.ok(nodes(tree).some(n=>n.props?.role==='alert'));assert.deepEqual(applied,['Reviewed notes']);
button(tree,'Cancel').props.onClick();props.value='';tree=render();assert.equal(button(tree,'Polish notes with AI').props.disabled,true);
props.value='notes';tree=render();button(tree,'Polish notes with AI').props.onClick();tree=render();
api.functions.invoke=()=>new Promise(r=>{resolve=r;});button(tree,'Polish Notes').props.onClick();tree=render();button(tree,'Cancel').props.onClick();
resolve({data:{cleaned:'Late result'},error:null});await new Promise(r=>setTimeout(r,0));tree=render();assert.ok(!nodes(tree).some(n=>n.type==='Modal'));assert.deepEqual(applied,['Reviewed notes']);
console.log('Notes polish: confirmation, approval, editing, stale notes, errors, cancellation and empty input passed.');
