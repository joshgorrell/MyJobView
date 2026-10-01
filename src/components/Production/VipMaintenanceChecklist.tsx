import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Circle, Plus, Trash2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const sections = [
  ['customer_check_in','Customer Check-In'],
  ['network_internet','Network & Internet'],
  ['av_automation','A/V & Automation'],
  ['security_surveillance','Security & Surveillance'],
  ['room_by_room','Room-by-Room'],
  ['preventive_maintenance','Preventive Maintenance'],
] as const;

const dispositions = [
  ['resolved_today','Resolved Today'],['punchlist','Add to Punchlist'],
  ['service_follow_up','Service Follow-Up'],['sales','Send to Sales'],['no_action','No Action']
] as const;

type Finding={id?:string;room:string;description:string;notes:string;dispositions:string[];punchlist_task_id?:string|null;service_request_id?:string|null;sales_task_id?:string|null;routed_at?:string|null};

export default function VipMaintenanceChecklist({workOrderId,onChange}:{workOrderId:string;onChange?:()=>void}) {
 const {profile}=useAuth(); const [visit,setVisit]=useState<any>(null); const [findings,setFindings]=useState<Finding[]>([]); const [saving,setSaving]=useState(false);
 useEffect(()=>{load();},[workOrderId]);
 async function load(){
  let {data:v}=await supabase.from('vip_maintenance_visits').select('*').eq('work_order_id',workOrderId).maybeSingle();
  if(!v&&profile?.organization_id){const r=await supabase.from('vip_maintenance_visits').insert({work_order_id:workOrderId,organization_id:profile.organization_id,created_by:profile.id}).select().single();v=r.data;}
  setVisit(v); if(v){const {data}=await supabase.from('vip_maintenance_findings').select('*').eq('visit_id',v.id).order('created_at');setFindings(data||[]);}
 }
 const missing=useMemo(()=>{if(!visit)return ['VIP Maintenance']; const m:string[]=[];
  sections.forEach(([k,l])=>{const x=visit.responses?.[k];if(!x?.complete&&!x?.na)m.push(l);});
  if(!visit.responses?.customer_training?.complete&&!visit.training_not_needed&&!visit.customer_not_present)m.push('Customer Training');
  if(!visit.no_issues_found&&!findings.length)m.push('Findings / Issues');
  if(findings.some(f=>!f.dispositions?.length))m.push('Finding Dispositions');
  if(!visit.no_opportunities_identified&&!(visit.responses?.opportunities||[]).length)m.push('Opportunities / Wish List');
  if(!visit.customer_not_present&&!visit.customer_acknowledged_at)m.push('Customer Acknowledgment'); return m;
 },[visit,findings]);
 async function patch(p:any){if(!visit)return;setSaving(true);const next={...visit,...p,updated_at:new Date().toISOString()};setVisit(next);await supabase.from('vip_maintenance_visits').update(p).eq('id',visit.id);setSaving(false);onChange?.();}
 async function setSection(k:string,p:any){await patch({responses:{...(visit.responses||{}),[k]:{...(visit.responses?.[k]||{}),...p}}});}
 async function addFinding(){if(!visit||!profile)return;const {data}=await supabase.from('vip_maintenance_findings').insert({visit_id:visit.id,organization_id:profile.organization_id,created_by:profile.id,description:'New finding'}).select().single();if(data)setFindings([...findings,data]);}
 async function updateFinding(f:Finding,p:any){const next={...f,...p};setFindings(findings.map(x=>x.id===f.id?next:x));if(f.id)await supabase.from('vip_maintenance_findings').update(p).eq('id',f.id);}
 async function removeFinding(f:Finding){if(f.id)await supabase.from('vip_maintenance_findings').delete().eq('id',f.id);setFindings(findings.filter(x=>x.id!==f.id));}
 async function routeFinding(f:Finding){if(!f.id)return;setSaving(true);const {data,error}=await supabase.rpc('route_vip_maintenance_finding',{p_finding_id:f.id});setSaving(false);if(error){alert(error.message);return;}setFindings(findings.map(x=>x.id===f.id?data:x));onChange?.();}
 if(!visit)return <div className="p-6 text-sm text-gray-500">Preparing VIP Maintenance checklist…</div>;
 return <div className="space-y-5">
  <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-gray-900">VIP Maintenance Visit</h3><p className="text-sm text-gray-600">Complete each applicable section. Batteries, replacement parts and consumables are billed through the normal Work Order parts flow.</p></div><span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${missing.length?'bg-amber-100 text-amber-700':'bg-green-100 text-green-700'}`}>{missing.length?missing.length+' incomplete':'Ready to complete'}</span></div>
  {sections.map(([k,label])=>{const x=visit.responses?.[k]||{};return <section key={k} className={`rounded-xl border p-4 ${x.na?'bg-gray-50 opacity-70':'bg-white'}`}><div className="flex items-center justify-between gap-3"><button onClick={()=>setSection(k,{complete:!x.complete,na:false})} className="flex items-center gap-2 text-left font-semibold text-gray-900">{x.complete?<CheckCircle className="w-5 h-5 text-green-600"/>:<Circle className="w-5 h-5 text-gray-400"/>}{label}</button><label className="flex items-center gap-1.5 text-xs text-gray-500"><input type="checkbox" checked={!!x.na} onChange={e=>setSection(k,{na:e.target.checked,complete:false})}/>N/A</label></div>{!x.na&&<textarea value={x.notes||''} onChange={e=>setSection(k,{notes:e.target.value})} rows={2} placeholder="Notes (optional)" className="mt-3 w-full border border-gray-200 rounded-lg p-2 text-sm"/>}</section>})}
  <section className="rounded-xl border p-4"><div className="flex items-center justify-between"><button onClick={()=>setSection('customer_training',{complete:!visit.responses?.customer_training?.complete})} className="flex items-center gap-2 font-semibold">{visit.responses?.customer_training?.complete?<CheckCircle className="w-5 h-5 text-green-600"/>:<Circle className="w-5 h-5 text-gray-400"/>}Customer Training</button><label className="text-xs text-gray-600 flex gap-1.5"><input type="checkbox" checked={visit.training_not_needed} onChange={e=>patch({training_not_needed:e.target.checked})}/>No customer present / training not needed</label></div></section>
  <section className="rounded-xl border p-4 space-y-3"><div className="flex justify-between"><h4 className="font-semibold">Findings / Issues</h4><label className="text-xs flex gap-1.5"><input type="checkbox" checked={visit.no_issues_found} onChange={e=>patch({no_issues_found:e.target.checked})}/>No Issues Found</label></div>
   {findings.map(f=><div key={f.id} className="border rounded-lg p-3 space-y-2"><div className="flex gap-2"><input value={f.room||''} onChange={e=>updateFinding(f,{room:e.target.value})} placeholder="Room" className="w-32 border rounded p-2 text-sm"/><input value={f.description} onChange={e=>updateFinding(f,{description:e.target.value})} className="flex-1 border rounded p-2 text-sm"/><button onClick={()=>removeFinding(f)}><Trash2 className="w-4 h-4 text-gray-400"/></button></div><textarea value={f.notes||''} onChange={e=>updateFinding(f,{notes:e.target.value})} placeholder="Notes" className="w-full border rounded p-2 text-sm"/><div className="flex flex-wrap gap-2">{dispositions.map(([v,l])=><label key={v} className="text-xs border rounded-full px-2 py-1"><input className="mr-1" type="checkbox" checked={(f.dispositions||[]).includes(v)} onChange={e=>updateFinding(f,{dispositions:e.target.checked?[...(f.dispositions||[]),v]:(f.dispositions||[]).filter(x=>x!==v)})}/>{l}</label>)}</div></div>)}
   <button onClick={addFinding} className="text-sm text-blue-600 flex gap-1 items-center"><Plus className="w-4 h-4"/>Add finding</button>
  </section>
  <section className="rounded-xl border p-4 space-y-3"><div className="flex justify-between"><h4 className="font-semibold">Opportunities / Wish List</h4><label className="text-xs flex gap-1.5"><input type="checkbox" checked={visit.no_opportunities_identified} onChange={e=>patch({no_opportunities_identified:e.target.checked})}/>No Opportunities Identified</label></div><textarea value={(visit.responses?.opportunities||[]).join('\n')} onChange={e=>patch({responses:{...(visit.responses||{}),opportunities:e.target.value.split('\n').filter(Boolean)}})} rows={3} placeholder="One opportunity per line" className="w-full border rounded-lg p-2 text-sm"/></section>
  <section className="rounded-xl border p-4"><h4 className="font-semibold mb-3">Review & Complete</h4><div className="flex flex-wrap gap-4"><label className="text-sm flex gap-2"><input type="checkbox" checked={visit.customer_not_present} onChange={e=>patch({customer_not_present:e.target.checked})}/>Customer Not Present</label>{!visit.customer_not_present&&<label className="text-sm flex gap-2"><input type="checkbox" checked={!!visit.customer_acknowledged_at} onChange={e=>patch({customer_acknowledged_at:e.target.checked?new Date().toISOString():null})}/>Customer acknowledgment captured</label>}</div>{missing.length>0&&<div className="mt-3 flex gap-2 text-sm text-amber-700"><AlertCircle className="w-4 h-4 mt-0.5"/>Still required: {missing.join(', ')}</div>}</section>
  {saving&&<p className="text-xs text-gray-400">Saving…</p>}
 </div>;
}
