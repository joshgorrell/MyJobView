import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const realRequire=createRequire(import.meta.url);
function harness(path,imports={},globals={}) {
  let cursor=0;const values=[],deps=[],effects=[];
  const React={
    useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},
    useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(fn);}},
    useRef(initial){const i=cursor++;return values[i]||=( {current:initial});},
    lazy:()=> 'Calendar',Suspense:'Suspense',
  };
  const jsx=(type,props)=>({type,props});const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    console,module,exports:module.exports,Date,URLSearchParams,...globals,
    require(name){if(name==='react')return {...React,default:React};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};if(name==='lucide-react')return new Proxy({},{get:(_,key)=>key});if(name in imports)return imports[name];throw Error(name);},
  });
  return {exports:module.exports,render(name,props={}){cursor=0;return module.exports[name](props);},effects};
}
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const text=t=>Array.isArray(t)?t.map(text).join(''):t&&typeof t==='object'?text(t.props?.children):t==null?'':String(t);
const profile={id:'tech',organization_id:'org',employment_type:'job_time',requires_daily_clock:false,full_name:'Technician'};
const auth={useAuth:()=>({profile})};
const policy={useEmployeeTimePolicy:()=>({ready:true,loading:false,basis:'work_allocation',dailyClock:false,canManage:false})};
const nav=[];const writes=[];
function query(table){const q=new Proxy({}, {get(_,key){if(key==='then')return(resolve)=>resolve({error:null,data:table==='work_orders'?[{id:'wo-1',work_order_number:'WO-100',title:'Install Speakers',status:'assigned',scheduled_start_time:'08:00',project:{name:'Home'}}]:table==='company_settings'?{shop_time_request_enabled:true,training_time_request_enabled:true}:[]});return(...args)=>{if(['insert','update','delete','upsert'].includes(key))writes.push([table,key,args]);return q;};}});return q;}
const launch=harness('src/components/Layout/DailyLaunchpad.tsx',{
  '../../lib/supabase':{supabase:{from:query}},'../../contexts/AuthContext':auth,'../../hooks/useEmployeeTimePolicy':policy,
  '../../lib/timezoneUtils':{getOrganizationTimezone:async()=> 'America/Chicago',formatDateInTimezone:()=> '2026-10-02'},
  '../Technician/ManualJobTimeRequestModal':{ManualJobTimeRequestModal:'ManualJobTimeRequestModal'},
  '../Technician/RequestInternalTimeModal':{RequestInternalTimeModal:'RequestInternalTimeModal'},
  '../Technician/MyTimeView':{MyTimeView:'MyTimeView'},
},{window:{location:{search:''},addEventListener(){},removeEventListener(){}},document:{activeElement:null,body:{style:{overflow:""}}}});
let closed=0;const props={onClose(){closed++;},onNavigate:(...args)=>nav.push(args)};
launch.render('DailyLaunchpad',props);launch.effects.splice(0).forEach(fn=>fn());
for(let i=0;i<20;i++)await Promise.resolve();
let tree=launch.render('DailyLaunchpad',props);
assert.ok(text(tree).includes('Install Speakers'));
const card=nodes(tree).find(n=>n.type==='button'&&text(n).includes('Install Speakers'));
card.props.onClick();assert.equal(nav[0][0],'work_orders');assert.equal(nav[0][1].workOrderId,'wo-1');assert.equal(closed,1);assert.equal(writes.length,0);
assert.ok(nodes(tree).some(n=>n.type==='button'&&text(n)==='Request Manual Job Time'));
nodes(tree).find(n=>n.type==='button'&&text(n)==='Daily Calendar').props.onClick();tree=launch.render('DailyLaunchpad',props);
const calendar=nodes(tree).find(n=>n.type==='Calendar');assert.ok(calendar);assert.equal(calendar.props.personalOnly,true);
calendar.props.onWorkOrderSelect('wo-2');assert.equal(nav[1][1].workOrderId,'wo-2');assert.equal(writes.length,0);
const dash=harness('src/components/Technician/TechDashboard.tsx',{'../../hooks/useEmployeeTimePolicy':policy,'./DailyClock':{DailyClock:'DailyClock'},'../Production/TechnicianWorkCenter':{TechnicianWorkCenter:'TechnicianWorkCenter'},'./MyTimeView':{MyTimeView:'MyTimeView'},'../../contexts/AuthContext':auth});
tree=dash.render('TechDashboard');assert.ok(!text(tree).includes('Daily Clock'));assert.ok(nodes(tree).some(n=>n.type==='TechnicianWorkCenter'));
const mytime=harness('src/components/Technician/MyTimeView.tsx',{
  '../../hooks/useEmployeeTimePolicy':policy,'./MyJobTimeView':{MyJobTimeView:'MyJobTimeView'},'../../lib/timezoneUtils':{},'../../lib/supabase':{supabase:{}},'../../contexts/AuthContext':auth,
  './TimeAdjustmentRequestModal':{TimeAdjustmentRequestModal:'TimeAdjustmentRequestModal'},'../ui/ConfirmModal':{default:'ConfirmModal'},
});
tree=mytime.render('MyTimeView');assert.equal(tree.type,'MyJobTimeView');assert.equal(tree.props.salary,false);
const manual=harness('src/components/Dispatch/ManualJobTimeEntry.tsx',{
  '../../lib/employeeTimePolicy':{canManageTime:()=>false},'../../lib/timezoneUtils':{},'../../lib/supabase':{supabase:{}},'../../contexts/AuthContext':auth,
});
assert.ok(text(manual.render('ManualJobTimeEntry',{onClose(){},onSave(){}})).includes('requires time-management permission'));
console.log('Employee time UI: header/calendar route to canonical WO without writes; Job Time hides Daily Clock; My Time uses job records; non-manager manual entry blocked.');

const tz=harness('src/lib/timezoneUtils.ts',{'date-fns':realRequire('date-fns'),'date-fns-tz':realRequire('date-fns-tz'),'./supabase':{supabase:{}}}).exports;
for(const zone of ['UTC','America/Los_Angeles','Pacific/Auckland']) {
  process.env.TZ=zone;
  assert.equal(tz.calendarDateKey(new Date(2026,9,2,12)),'2026-10-02');
  assert.equal(tz.createTimestampInTimezone('2026-10-02','00:30','America/Chicago'),'2026-10-02T05:30:00.000Z');
}
const midnight=tz.createTimestampInTimezone('2026-03-08','00:00','America/Chicago');
const nextMidnight=tz.createTimestampInTimezone('2026-03-09','00:00','America/Chicago');
assert.equal((Date.parse(nextMidnight)-Date.parse(midnight))/3600000,23);
const corrections=[];const alerts=[];
const correction=harness('src/components/Technician/TimeAdjustmentRequestModal.tsx',{
 '../../lib/timezoneUtils':{...tz,getOrganizationTimezone:async()=> 'America/Chicago'},
 '../../lib/supabase':{supabase:{from:()=>({insert:async value=>{corrections.push(value);return {error:null};}})}},'../../contexts/AuthContext':auth,
},{alert:value=>alerts.push(value)});
const correctionProps={entry:{id:'daily',entry_date:'2026-09-01',clock_in:'2026-09-02T04:00:00Z',clock_out:'2026-09-02T06:00:00Z'},onClose(){},onSubmit(){}};
correction.render('TimeAdjustmentRequestModal',correctionProps);correction.effects.splice(0).forEach(fn=>fn());for(let i=0;i<5;i++)await Promise.resolve();
tree=correction.render('TimeAdjustmentRequestModal',correctionProps);
const correctionTimes=nodes(tree).filter(n=>n.type==='input'&&n.props.type==='time');
assert.equal(correctionTimes[0].props.value,'23:00');assert.equal(correctionTimes[1].props.value,'01:00');
assert.equal(nodes(tree).find(n=>n.type==='input'&&n.props.type==='date').props.value,'2026-09-02');
nodes(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Correct overnight work'}});
tree=correction.render('TimeAdjustmentRequestModal',correctionProps);
await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
assert.equal(corrections[0].requested_clock_in,'2026-09-02T04:00:00.000Z');
assert.equal(corrections[0].requested_clock_out,'2026-09-02T06:00:00.000Z');
console.log('Organization dates and overnight corrections pass across UTC, Los Angeles and Auckland browser timezones; DST day boundary is 23 hours.');
const nativeValues={profiles:{organization_id:'org',employment_type:'hourly',requires_daily_clock:true},organizations:{timezone:'America/Chicago'},employees:{id:'employee'},employee_payroll_configs:{payroll_time_basis:'work_allocation',requires_daily_clock:true},company_settings:{app_url:'https://mjv.example/app?old=1'}};
const nativeQueries=[];
const nativeSupabase={from(table){const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>resolve({data:nativeValues[table],error:null});return(...args)=>{nativeQueries.push([table,key,args]);return q;};}});return q;}};
const native=harness('mobile/src/services/EmployeeTimeContext.ts',{'./supabase':{supabase:nativeSupabase}},{Intl}).exports;
assert.equal(native.workDate(new Date('2026-10-02T04:30Z'),'America/Chicago'),'2026-10-01');
assert.equal((await native.getEmployeeTimeContext('tech')).dailyClock,false,'Job Time effective configuration wins in native');
nativeValues.employee_payroll_configs={payroll_time_basis:'daily_clock',requires_daily_clock:true};
assert.equal((await native.getEmployeeTimeContext('tech')).dailyClock,true);
assert.ok(nativeQueries.some(([table,key,args])=>table==='organizations'&&key==='eq'&&args[0]==='id'&&args[1]==='org'));
const opened=[];
const opener=harness('mobile/src/services/OpenMJV.ts',{'./supabase':{supabase:nativeSupabase},'react-native':{Linking:{openURL:async url=>opened.push(url)}}},{URL}).exports;
await opener.openMJV('tech',{tab:'work_orders',workOrderId:'wo-1'});
assert.equal(opened[0],'https://mjv.example/?tab=work_orders&workOrderId=wo-1');
nativeValues.company_settings={app_url:'http://mjv.example'};
await assert.rejects(()=>opener.openMJV('tech',{commandCenter:'1'}),/HTTPS/);
nativeValues.company_settings={};
await assert.rejects(()=>opener.openMJV('tech',{commandCenter:'1'}),/configure/);
assert.equal(opened.length,1);
console.log('Native configuration and canonical HTTPS Work Order handoff contracts passed.');
// Interactive titles must not be embedded in plain confirmation/tooltip strings.
const calendarSource=ts.createSourceFile('AppointmentsCalendar.tsx',fs.readFileSync('src/components/Appointments/AppointmentsCalendar.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function assertPlainTemplates(node,inTemplate=false){
 if(inTemplate)assert.ok(!ts.isJsxElement(node)&&!ts.isJsxSelfClosingElement(node),'Calendar template strings must contain plain titles');
 ts.forEachChild(node,child=>assertPlainTemplates(child,inTemplate||ts.isTemplateExpression(node)));
}
assertPlainTemplates(calendarSource);
