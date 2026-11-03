import {useCallback,useEffect,useState} from 'react';
import {RefreshCw,AlertTriangle} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {supabase} from '../../lib/supabase';
import {laborProjectIsNative,type LaborBundle} from '../../lib/laborDashboard';
import {projectPerformance,projectPolicy,type PerformanceProject} from '../../lib/projectPerformance';
const h=(n:number)=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const money=(n:number|null)=>n===null?'—':n.toLocaleString('en-US',{style:'currency',currency:'USD'});
export default function ProjectStats(){
 const {profile}=useAuth();
 const [bundle,setBundle]=useState<LaborBundle|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=useCallback(async(signal?:AbortSignal)=>{
  if(profile?.role!=='admin')return;
  setLoading(true);setError('');
  try{
   const end=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   let query=supabase.rpc('get_labor_dashboard',{p_start:end,p_end:end});
   if(signal)query=query.abortSignal(signal);
   const {data,error:failure}=await query;if(failure)throw failure;
   if(!signal?.aborted)setBundle(data as LaborBundle);
  }catch(e){if(!signal?.aborted)setError((e as Error).message||'Project report unavailable');}
  finally{if(!signal?.aborted)setLoading(false);}
 },[profile?.organization_id,profile?.role]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);const focus=()=>{if(document.visibilityState==='visible')void load(controller.signal);};window.addEventListener('focus',focus);return()=>{controller.abort();window.removeEventListener('focus',focus);};},[load]);
 if(profile?.role!=='admin')return <p>Project Stats requires company administrator access.</p>;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:bundle?.timezone||'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const native=!!bundle&&laborProjectIsNative(bundle,today,today);
 const source=bundle?.sources.find(s=>s.source==='ipoint');
 const policy=projectPolicy(profile.organization_id!);
 const raw=(native?bundle?.native_projects:bundle?.project_snapshot?.payload.records)??[];
 const report=projectPerformance(raw as PerformanceProject[],native?{quotedRate:null}:policy);
 const snapshot=native?today:bundle?.project_snapshot?.day;
 const usable=!!bundle&&(native||!!bundle.project_snapshot);
 const percent=(count:number)=>report.assessed?(count/report.assessed*100).toFixed(1)+'%':'—';
 return <div className="project-performance" aria-label="Company project statistics">
  <div className="project-stats-heading"><div><h2>Project Stats</h2><p>{native?'Completed MJV projects':policy.since?'Completed projects · since January 1, 2025':'Completed projects · latest imported report'}</p></div><button onClick={()=>void load()} disabled={loading} className="project-stats-refresh"><RefreshCw size={16}/>{loading?'Refreshing…':'Refresh stats'}</button></div>
  <div className="project-stats-source"><strong>{snapshot?`${native?'MJV data through':'iPoint report as of'} ${snapshot}`:'Awaiting a verified project report'}</strong><span>{source?.enabled===false?'iPoint imports intentionally disabled. Stored history remains available.':source?.last_error?'Import needs attention: '+source.last_error:'Uses the existing automatic import feed. New figures appear after a valid report is received.'}</span></div>
  {error&&<p role="alert" className="pm-error">{error}{bundle?' Showing the last successfully loaded report.':''}</p>}
  {loading&&!bundle?<p role="status">Loading project statistics…</p>:!usable?<p className="pm-empty">No verified project snapshot is available yet.</p>:<>
   <div className="project-stats-cards">
    <article><span>Labor budget efficiency</span><strong>{report.budgetEfficiency===null?'—':report.budgetEfficiency.toFixed(1)+'%'}</strong><p>100% = on budget · higher is better</p><small>{h(report.sold)} quoted ÷ {h(report.used)} total job hours. Weighted by labor hours; includes recorded warranty labor.</small></article>
    <article className="project-accuracy-card"><span>Quote Target Accuracy</span><div className="project-accuracy-grid">{[{label:'On target / under budget',count:report.onTarget,tone:'good'},{label:'Within 10% over',count:report.within10,tone:'warn'},{label:'Off target >10% over',count:report.offTarget,tone:'bad'}].map(r=><div key={r.label} className={r.tone}><strong>{percent(r.count)}</strong><b>{r.label}</b><small>{r.count} of {report.assessed} assessed jobs</small></div>)}</div><small>Counts jobs. At or under quoted hours is on target; up to 110% is slightly over. Approved installation estimates separate warranty/scope time. {report.unassessed>0?`${report.unassessed} jobs need a usable target before assessment.`:''}</small></article>
   </div>
   <div className="project-earned-card"><div><span>Estimated earned labor rate</span><strong>{money(report.earned)}<small> / job hour</small></strong><p>{native?'Actual quoted labor dollars are needed to calculate this rate.':policy.quotedRate!==null?`Based on ${money(policy.quotedRate)}/hour average quoted labor across prewire, trim and install.`:'An average quoted labor rate is needed to estimate this figure.'}</p></div><div><b>How are our quotes performing?</b><p>{report.revenue===null?'Quoted labor revenue is unavailable.':`${money(report.revenue)} estimated labor revenue ÷ ${h(report.used)} recorded project hours.`} This describes project labor performance. Team payroll utilization is a separate measure.</p><small>This is an estimate, not collected revenue or profit. Exact earned rate requires actual quoted labor dollars. {report.excludedRate>0?`${report.excludedRate} completed jobs lack comparable quoted/used hours and are excluded from the rate.`:''}</small></div></div>
   {report.warrantyCount>0&&<div className="project-warranty-card"><div><span>Estimated non-billable warranty / scope time</span><strong>{h(report.extra)} hours</strong></div><p>{report.warrantyCount} flagged projects use the approved 92% installation allowance. Remaining recorded hours are estimated product-warranty or customer-scope time. {report.beforeWarranty!==null&&report.earned!==null?`Estimated earned rate: ${money(report.beforeWarranty)} before this extra time; ${money(report.earned)} including it.`:''} This estimates the excess; it does not establish actual warranty hours or indicate improper installation.</p></div>}
   {report.duplicates>0&&<p role="alert" className="pm-error"><AlertTriangle size={16}/> {report.duplicates} duplicate or unidentified parent-order rows were excluded. Review the report before presenting these figures.</p>}
   <p className="project-stats-note">{report.completed} completed parent projects · one cumulative snapshot, never added across report dates. The management filters do not alter this historical report. For individual imported project details, look up the sales-order number in iPoint.</p>
  </>}
 </div>;
}
