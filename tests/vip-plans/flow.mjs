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

const fixture = {
  recurring_plans: [
    {id:'vip',plan_name:'VIP Gold',description:'Support membership',billing_frequency:'monthly',amount:25,tax_rate:0,is_active:true,show_on_portal:true,plan_type:'vip_plan'},
    {id:'maintenance',plan_name:'Maintenance only',plan_type:'maintenance'},
  ],
  recurring_subscriptions: [
    {id:'active',contact:{full_name:'Active customer',email:'active@example.com'},plan:{plan_name:'VIP Gold',plan_type:'vip_plan'},status:'active',start_date:'2026-01-01',next_billing_date:'2026-11-01'},
    {id:'cancelled',contact:{full_name:'Cancelled customer',email:'cancelled@example.com'},plan:{plan_name:'VIP Gold',plan_type:'vip_plan'},status:'cancelled',start_date:'2026-01-01'},
    {id:'other',contact:{full_name:'Other product customer',email:'other@example.com'},plan:{plan_name:'Maintenance only',plan_type:'maintenance'},status:'pending_payment'},
    {id:'trial',contact:{full_name:'Trial customer',email:'trial@example.com'},plan:null,status:'trial',trial_source:'vip_trial',trial_end_date:'2026-10-10'},
    {id:'legacy',contact:{full_name:'Legacy customer',email:'legacy@example.com'},plan:null,status:'trial',trial_source:'test_and_tune_legacy',trial_end_date:'2026-10-10'},
    {id:'pending',contact:{full_name:'Pending customer',email:'pending@example.com'},plan:{plan_name:'VIP Gold',plan_type:'vip_plan'},status:'pending_payment',start_date:'2026-10-01',notes:null},
  ],
  signup_attempts:[{id:'signup',email:'signup@example.com',first_name:'Signup',last_name:'Customer',status:'in_progress',current_step:'payment',last_activity_at:'2026-10-01'}],
};
const mutations=[];
let failingTable=null;
const supabase={from(table){const predicates=[];let mutation;
  const q={select(){return q;},order(){return q;},eq(k,v){predicates.push(row=>row[k]===v);return q;},neq(k,v){predicates.push(row=>row[k]!==v);return q;},update(data){mutation={table,data};return q;},insert(data){mutation={table,data};return q;},delete(){mutation={table,delete:true};return q;},then(resolve){if(mutation)mutations.push(mutation);return Promise.resolve({data:(fixture[table]||[]).filter(row=>predicates.every(test=>test(row))),error:failingTable===table?{message:'Failed'}:null}).then(resolve);}};return q;
}};
const notices=[];
const toast={success(message){notices.push(message);},error(message){notices.push(message);}};
const h=harness('src/components/Finance/VIPPlanManagement.tsx',{window:{location:{origin:'https://dealer.example.com'}},setTimeout}, {
  '../../lib/supabase':{supabase},'../Shared/Toast':{useToast:()=>toast},'../ui/ConfirmModal':{default:'ConfirmModal'},'../Shared/QuickActionModal':{QuickActionModal:'QuickActionModal'},
});
const render=()=>h.render({},'VIPPlanManagement');
async function settle(){for(const effect of h.effects.splice(0))effect();for(let i=0;i<10;i++)await new Promise(setImmediate);return render();}
function button(tree,label){return nodes(tree).find(n=>n.type==='button'&&text(n).includes(label));}
render();let tree=await settle();
assert.ok(text(tree).includes('Active customer'));
assert.ok(!text(tree).includes('Cancelled customer'));
assert.ok(!text(tree).includes('Other product customer'),'Non-VIP pending payments must not appear');
button(tree,'Members').props.onClick(); tree=render();
nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'all'}});tree=render();
assert.ok(text(tree).includes('Cancelled customer')); assert.ok(text(tree).includes('cancelled'));
button(tree,'Plan setup').props.onClick();tree=render();assert.ok(text(tree).includes('VIP Gold'));assert.ok(!text(tree).includes('Maintenance only'));
button(tree,'New plan').props.onClick();tree=render();
await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(mutations.length,0,'An invalid plan must not be saved');
nodes(tree).find(n=>n.type==='input'&&n.props['aria-label']==='Plan name').props.onChange({target:{value:' VIP Test '}});tree=render();
nodes(tree).find(n=>n.type==='input'&&n.props['aria-label']==='Plan amount').props.onChange({target:{value:'12.5'}});tree=render();
await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=await settle();
assert.equal(mutations[0].data.plan_name,'VIP Test');assert.equal(mutations[0].data.plan_type,'vip_plan');assert.equal(mutations[0].data.amount,12.5);
nodes(tree).find(n=>n.type==='input'&&n.props['aria-label']==='Search VIP section').props.onChange({target:{value:'unmatched'}});tree=render();assert.ok(text(tree).includes('No plans match your search'));
button(tree,'Trials').props.onClick();tree=render();assert.ok(text(tree).includes('Trial customer'));assert.ok(text(tree).includes('Legacy customer'));
const trialButtons=nodes(tree).filter(n=>n.type==='button'&&text(n).includes('Extend Trial'));
assert.equal(trialButtons[0].props.disabled,false);assert.equal(trialButtons[1].props.disabled,true,'Test & Tune history must not be extendable as VIP');
trialButtons[0].props.onClick();tree=render();
nodes(tree).find(n=>n.type==='input'&&n.props.type==='number').props.onChange({target:{value:'5'}});tree=render();
await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=await settle();
assert.equal(JSON.stringify(mutations.find(m=>m.data?.trial_end_date)),JSON.stringify({table:'recurring_subscriptions',data:{trial_end_date:'2026-10-15'}}));
button(tree,'Incomplete signups').props.onClick();tree=render();
const followup=nodes(tree).find(n=>n.type==='a');assert.ok(decodeURIComponent(followup.props.href).includes('https://dealer.example.com/vip-membership'));assert.ok(!followup.props.href.includes('[Portal URL]'));
button(tree,'Awaiting payment').props.onClick();tree=render();assert.ok(text(tree).includes('Pending customer'));assert.ok(!text(tree).includes('Other product customer'));
button(tree,'Confirm payment & activate').props.onClick();tree=render();
nodes(tree).find(n=>n.type==='ConfirmModal'&&n.props.isOpen&&n.props.title==='Activate Membership').props.onConfirm();tree=await settle();
const activation=mutations.find(m=>m.data?.status==='active');assert.ok(activation);assert.ok(!activation.data.notes.startsWith('null'));
failingTable='recurring_subscriptions';await nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']==='Refresh VIP memberships').props.onClick();tree=await settle();assert.ok(text(tree).includes('Could not load memberships'),'Failed queries must show an error, not silently appear empty');
console.log('VIP membership scope, status/search, trial extension, follow-up URL and load-error checks passed.');
