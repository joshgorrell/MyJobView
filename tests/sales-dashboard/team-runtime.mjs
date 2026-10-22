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
let mode='valid';const calls=[];
const rep=(id,won,lost,booked)=>({repId:id,repDisplayName:id,bookedSales:{total:booked,count:1},pipeline:{total:50,count:1},closeRate:{wonCount:won,lostCount:lost}});
const records=[rep('a',9,1,100),rep('b',1,1,200)];
const supabase={from(table){assert.equal(table,'profiles');const q=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>Promise.resolve({data:mode==='empty'?[]:[{id:'a'},{id:'b'}],error:null}).then(a,b);return(...args)=>{calls.push({key,args});return q;};}});return q;},async rpc(name,args){calls.push({name,args});if(mode==='error')return{error:{message:'Denied'}};let reps=mode==='partial'?records.slice(0,1):mode==='duplicate'?[records[0],records[0]]:mode==='foreign'?[records[0],rep('foreign',1,0,999)]:mode==='invalid'?[records[0],{...records[1],bookedSales:{total:'NaN',count:1}}]:records;return{data:{reps},error:null};}};
const component=harness('src/components/SalesDashboard/SalesTeamOverview.tsx',()=>({supabase}));
const render=()=>component.render(m=>m.SalesTeamOverview({orgId:'org',onSelectRep:id=>calls.push({selected:id})}));
render();await component.flush();let tree=render();
assert.ok(text(tree).includes('$300'));assert.ok(text(tree).includes('83.3%'));assert.ok(text(tree).includes('rep periods'));assert.equal(text(tree).includes('75%'),false);
for(const [key,value] of [['organization_id','org'],['is_sales_rep',true],['is_active',true]])assert.ok(calls.some(c=>c.key==='eq'&&c.args[0]===key&&c.args[1]===value));
nodes(tree).find(n=>n.type==='button'&&text(n).includes('a$100')).props.onClick();assert.equal(calls.at(-1).selected,'a');
for(mode of ['partial','duplicate','foreign','invalid','error','empty']){
 const before=calls.filter(c=>c.name).length;
 nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']==='Refresh team sales').props.onClick();render();await component.flush();tree=render();
 if(mode==='empty'){assert.ok(text(tree).includes('No active sales reps'));assert.equal(calls.filter(c=>c.name).length,before);}
 else {assert.ok(nodes(tree).some(n=>n.props?.role==='alert'),mode);assert.equal(text(tree).includes('$300'),false,mode);}
}
console.log('PASS: organization/active-rep filters, weighted close rate, sums, rep navigation, partial/duplicate/foreign/invalid/error rejection, empty team');
