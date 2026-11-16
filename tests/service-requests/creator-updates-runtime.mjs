import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(path, imports, globals = {}) {
  let cursor = 0;
  const values = [], deps = [], effects = [];
  const react = {
    useRef(initial) { const i=cursor++; return values[i] ||= {current:initial}; },
    useState(initial) { const i=cursor++; if (!(i in values)) values[i]=initial; return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}]; },
    useEffect(fn, next) { const i=cursor++; if (!deps[i] || next.some((v,j)=>v!==deps[i][j])) { deps[i]=next; effects.push(fn); } },
  };
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    module,exports:module.exports,console,...globals,require(name) {
      if (name==='react') return react;
      if (name==='react/jsx-runtime') return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
      if (name in imports) return imports[name];
      return new Proxy({}, {get:(_,key)=>String(key)});
    },
  });
  return {run(name,...args) { cursor=0; return module.exports[name](...args); },effects};
}
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
const text=t=>Array.isArray(t)?t.map(text).join(''):!t||typeof t!=='object'?t==null?'':String(t):text(t.props?.children);
let refresh, source=[{id:'r1',customer_name:'Jones',status:'pending_customer',priority:'normal',created_at:'2026-11-16',source_type:'staff_form',job_description:'Schedule visit'}];
const queries=[];
const supabase={from(table) {
  const filters=[]; queries.push({table,filters});
  const q={select:()=>q,eq:(...args)=>{filters.push(args);return q;},order:()=>q,not:()=>q,is:()=>q,
    overrideTypes:()=>Promise.resolve({data:source,error:null})};
  return q;
}};
const view=harness('src/components/Sales/SalesServiceRequestsView.tsx',{
  '../../lib/supabase':{supabase},
  '../../contexts/AuthContext':{useAuth:()=>({profile:{id:'creator',organization_id:'org',role:'admin'}})},
  '../../hooks/useServiceRequestUpdates':{useServiceRequestUpdates:(_org,fn)=>{refresh=fn;}},
});
view.run('SalesServiceRequestsView',{ownOnly:true});
for(const effect of view.effects.splice(0)) effect();
await new Promise(resolve=>setImmediate(resolve));
let tree=view.run('SalesServiceRequestsView',{ownOnly:true});
assert.ok(queries[0].filters.some(([k,v])=>k==='created_by'&&v==='creator'),'My Requests filters by actual creator, including admins');
assert.ok(queries[0].filters.some(([k,v])=>k==='organization_id'&&v==='org'),'Organization is explicit');
assert.match(text(tree),/Waiting on Customer/);
nodes(tree).find(n=>n.props?.onClick&&n.type==='div'&&n.props.className==='p-4 cursor-pointer').props.onClick();
tree=view.run('SalesServiceRequestsView',{ownOnly:true});
assert.ok(nodes(tree).some(n=>n.type==='ContactLogHistory'),'Creator can read contact notes');
source=[{...source[0],status:'closed'}];
refresh();
assert.doesNotMatch(text(view.run('SalesServiceRequestsView',{ownOnly:true})),/Loading service requests/,'Background refresh keeps the request visible');
await new Promise(resolve=>setImmediate(resolve));
tree=view.run('SalesServiceRequestsView',{ownOnly:true});
assert.match(text(tree),/Closed/,'Closed requests stay in My Requests with current status');
assert.ok(nodes(tree).some(n=>n.type==='ContactLogHistory'),'Background refresh preserves expanded details');

let calls=0, cleanup, subscribed, removed=0;
const handlers=[], timers=new Map(), intervals=new Map(), listeners=new Map();
let timerId=0;
const channel={on:(_type,filter,cb)=>{handlers.push({filter,cb});return channel;},subscribe:cb=>{subscribed=cb;return channel;}};
const hook=harness('src/hooks/useServiceRequestUpdates.ts',{'../lib/supabase':{supabase:{channel:()=>channel,removeChannel:()=>{removed++;}}}},{
  crypto:{randomUUID:()=> 'test'},document:{hidden:false,addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)},
  window:{addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
  setInterval:fn=>{intervals.set(++timerId,fn);return timerId;},clearInterval:id=>intervals.delete(id),
});
hook.run('useServiceRequestUpdates','org',()=>calls++);
cleanup=hook.effects[0]();
assert.deepEqual(handlers.map(h=>h.filter.table),['service_requests','customer_contact_log','work_orders']);
assert.ok(handlers.every(h=>h.filter.filter==='organization_id=eq.org'));
handlers[0].cb(); handlers[1].cb();
assert.equal(timers.size,1,'Bursts debounce to one refresh');
for(const fn of timers.values())fn(); timers.clear();
assert.equal(calls,1);
hook.run('useServiceRequestUpdates','org',()=>calls+=10);
subscribed('SUBSCRIBED');for(const fn of timers.values())fn();timers.clear();
assert.equal(calls,11,'Reconnect uses current callback');
for(const fn of intervals.values())fn();
assert.equal(calls,21,'Polling recovers missed events');
cleanup();
assert.equal(removed,1);assert.equal(intervals.size,0);assert.equal(listeners.size,0);
console.log('PASS: creator-only queue, current waiting/closed status, contact notes, preserved expansion, realtime sources, debounce, reconnect, polling and cleanup.');
