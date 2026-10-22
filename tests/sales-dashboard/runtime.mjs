import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(path, imports) {
 let cursor=0;const state=[],dependencies=[],cleanups=[],effects=[];
 const changed=(i,deps)=>!dependencies[i]||deps.some((v,j)=>v!==dependencies[i][j]);
 const react={
  useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},
  useEffect(fn,deps){const i=cursor++;if(changed(i,deps)){dependencies[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}},
  useMemo(fn,deps){const i=cursor++;if(changed(i,deps)){dependencies[i]=deps;state[i]=fn();}return state[i];},
  useCallback(fn,deps){return react.useMemo(()=>fn,deps);},
 };
 const jsx=(type,props)=>({type,props});const module={exports:{}};
 const output=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(output,{module,exports:module.exports,console,Date,setTimeout,clearTimeout,require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='lucide-react')return new Proxy({},{get:(_,key)=>key});return imports(name);}});
 return {exports:module.exports,render(fn){cursor=0;return fn(module.exports);},async flush(){for(const fn of effects.splice(0))fn();for(let i=0;i<5;i++)await new Promise(r=>setTimeout(r,0));}};
}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):n==null?'':String(n);
const calls=[];
const supabase={from(){const q=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>Promise.resolve({data:[],error:null,count:0}).then(a,b);return()=>q;}});return q;},async rpc(name,args){calls.push({name,args});return{data:{repId:args?.p_target_rep_id||'self',bookedSales:{},monthlyTrend:[]},error:null};}};
const hook=harness('src/hooks/useSalesDashboard.ts',()=>({supabase}));
let options={repId:'self',isManagerView:false};
const renderHook=()=>hook.render(m=>m.useSalesDashboard(options));
renderHook();await hook.flush();assert.equal(renderHook().data.repId,'self');
options={repId:'other',isManagerView:true};assert.equal(renderHook().data,null);await hook.flush();assert.equal(renderHook().data.repId,'other');assert.equal(calls.at(-1).args.p_target_rep_id,'other');
options={repId:null,isManagerView:false};assert.equal(renderHook().data,null);assert.equal(renderHook().loading,false);await hook.flush();assert.equal(renderHook().data,null);

const leaderboard=harness('src/hooks/useSalesDashboard.ts',()=>({supabase}));
const beforeLeaderboard=calls.length;
leaderboard.render(m=>m.useSalesLeaderboard(false));await leaderboard.flush();
assert.equal(leaderboard.render(m=>m.useSalesLeaderboard(false)).data,null);
assert.equal(calls.length,beforeLeaderboard);

console.log('PASS: real hook selection/reset, no previous-rep data, disabled leaderboard requests');
