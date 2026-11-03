import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const load=path=>{const module={exports:{}};vm.runInNewContext(compile(readFileSync(path,'utf8')),{module,exports:module.exports});return module.exports;};
const {nameFilters,searchBriefCustomers}=load('src/lib/designBriefSearch.ts');
assert.equal(nameFilters('Travis, Randy',['full_name']).length,2);
assert.equal(nameFilters('O\'Neil (Home)',['full_name'])[1],'full_name.ilike."%(Home)%"');
const calls=[];
const contact={id:'contact',full_name:'Randy Travis',contact_name:'Randy Travis'};
const supabase={from(table){const q={select(columns){assert.ok(!columns.split(',').map(v=>v.trim()).includes('address'));return q;},eq(field,value){calls.push({table,field,value});return q;},order(){return q;},or(filter){calls.push({table,filter});return q;},limit(){return q;},maybeSingle(){return q;},then(resolve){return Promise.resolve({data:table==='contacts'?[contact]:table==='company_settings'?{has_openai_api_key:true}:[],error:null}).then(resolve);}};return q;}};
const found=await searchBriefCustomers(supabase,'org','Travis, Randy');
assert.equal(found.contacts[0].source,'contact');
assert.equal(calls.filter(c=>c.field==='organization_id'&&c.value==='org').length,2);
assert.equal(calls.filter(c=>c.table==='contacts'&&c.filter).length,2);
await assert.rejects(()=>searchBriefCustomers(supabase,'','Trav'),/Organization/);
const {validatePrefill}=load('supabase/functions/process-design-brief/validation.ts');
const valid=()=>({rooms:[{name:'Kitchen',description:'Install audio',lineItems:[{description:'8 inch speaker',quantity:2,unit:'EA',itemType:'material',matchedProductId:'invented',overridePrice:5}]}]});
const sanitized=valid();validatePrefill(sanitized);assert.equal(sanitized.rooms[0].lineItems[0].matchedProductId,undefined);
for(const invalid of [{},null,[],{rooms:'oops'},{rooms:[{name:'Kitchen',lineItems:null}]},{rooms:[{name:'Kitchen',lineItems:[{description:'speaker',quantity:-1,unit:'EA',itemType:'material'}]}]}]) assert.throws(()=>validatePrefill(invalid),/invalid design/);

// Execute the actual modal with hook state and realistic asynchronous saves.
let cursor=0;const state=[],deps=[],effects=[];let tree;const rpcCalls=[];
const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useRef(v){return state[cursor++] ||= {current:v};},useCallback(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;state[i]=fn;}return state[i];},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(fn);}}};
const jsx=(type,props)=>({type,props});const module={exports:{}};let seq=0,failSave=false;
let saved='Earlier session: home theater with surround sound.';
supabase.rpc=async(name,args)=>{rpcCalls.push({name,args});if(failSave)return{error:{message:'Simulated save failure'}};saved=[saved,args.p_content].filter(Boolean).join('\n\n');return{data:{raw_notes:saved},error:null};};
supabase.auth={getSession:async()=>({data:{session:{access_token:'token'}}})};
supabase.functions={invoke:async()=>({data:{success:true},error:null})};
const fetchBodies=[];
vm.runInNewContext(compile(readFileSync('src/components/Sales/DesignBriefModal.tsx','utf8').replaceAll('import.meta.env.VITE_SUPABASE_URL',JSON.stringify('https://fixture.test'))),{
 module,exports:module.exports,console,crypto:{randomUUID:()=>`id-${++seq}`},window:{},setTimeout:(fn)=>setTimeout(fn,0),clearTimeout,setInterval:()=>0,clearInterval,
 fetch:async(url,args)=>{fetchBodies.push(JSON.parse(args.body));return{ok:true,json:async()=>({prefill:valid(),proposalId:null})};},
 require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};if(name==='lucide-react')return new Proxy({},{get:(_,key)=>key});if(name.endsWith('AuthContext'))return{useAuth:()=>({profile:{id:'rep',organization_id:'org'}})};if(name.endsWith('designBriefSearch'))return{nameFilters,searchBriefCustomers};if(name.endsWith('supabase'))return{supabase};throw new Error(name);}
});
const props={onClose(){},existingBrief:{id:'brief',contact_id:null,raw_notes:saved,status:'draft',title:'Theater'}};
const render=()=>{cursor=0;tree=module.exports.default(props);return tree;};
const settle=async()=>{for(let i=0;i<5;i++){render();for(const fn of effects.splice(0))fn();await new Promise(r=>setTimeout(r,5));}return render();};
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):n==null?'':String(n);
const button=label=>nodes(tree).find(n=>n.type==='button'&&text(n).includes(label));
await settle();assert.ok(text(tree).includes('Earlier session: home theater'));
const search=nodes(tree).find(n=>n.type==='input'&&n.props.placeholder?.startsWith('Search customers'));
search.props.onChange({target:{value:'Travis, Randy'}});await settle();
button('Randy Travis').props.onClick();await settle();
const textarea=()=>nodes(tree).find(n=>n.type==='textarea');
textarea().props.onChange({target:{value:'Add a pair of speakers in the kitchen.'}});await settle();
failSave=true;await button('Save').props.onClick();await settle();assert.equal(textarea().props.value,'Add a pair of speakers in the kitchen.');
failSave=false;await button('Save').props.onClick();await settle();assert.equal(textarea().props.value,'');
assert.ok(text(tree).includes('Earlier session: home theater'));assert.ok(saved.includes('Add a pair'));
await button('Preview with AI').props.onClick();await settle();
assert.ok(fetchBodies[0].notes.includes('Earlier session: home theater'));assert.ok(fetchBodies[0].notes.includes('Add a pair'));
assert.ok(text(tree).includes('Design preview saved'));assert.ok(!text(tree).includes('Draft proposal created'));
await button('Finish').props.onClick();await settle();assert.ok(text(tree).includes('Brief Submitted!'));
console.log('PASS: actual customer filters, special names, organization scope, AI structure validation, modal selection, legacy notes, save-failure retention, multi-session preview and explicit submission');
