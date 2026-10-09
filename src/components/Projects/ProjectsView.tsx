import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { loadProjectSummaries, projectOrderLink, type ProjectSummary } from '../../lib/projectOverview';
import ProjectDetail from './ProjectDetail';
import './projects.css';
const hours = (value: number) => `${value.toFixed(1)}h`;
const date = (value: string) => new Date(value.slice(0,10)+'T12:00:00').toLocaleDateString();
export default function ProjectsView() {
  const {profile,loading:authLoading} = useAuth();
  const [rows,setRows] = useState<ProjectSummary[]>([]), [loading,setLoading] = useState(true), [error,setError] = useState('');
  const [expanded,setExpanded] = useState<string|null>(null);
  const initial = new URLSearchParams(window.location.search);
  const [search,setSearch] = useState(()=>initial.get('projectSearch')||'');
  const [scope,setScope] = useState(()=>initial.get('projectScope')||'all');
  const [pm,setPm] = useState(()=>initial.get('projectPm')||'');
  const [office,setOffice] = useState(()=>initial.get('projectOffice')||'');
  const [status,setStatus] = useState(()=>initial.get('projectStatus')||'open');
  const [sort,setSort] = useState(()=>initial.get('projectSort')||'goal');
  const [legacyProject,setLegacyProject] = useState(()=>initial.get('projectId'));
  const request = useRef(0), busy = useRef(false);
  const load = useCallback(async (quiet=false) => {
    if(!profile?.organization_id || busy.current) return;
    busy.current=true; const id=++request.current;
    if(!quiet) setLoading(true);
    try {const result=await loadProjectSummaries(profile.organization_id);if(id===request.current){setRows(result);setError('');}}
    catch(failure){if(id===request.current)setError((failure as Error).message || 'Projects could not be loaded.');}
    finally{busy.current=false;if(id===request.current)setLoading(false);}
  },[profile?.organization_id]);
  useEffect(()=>{void load(); const timer=setInterval(()=>{if(document.visibilityState==='visible')void load(true);},30000);const focus=()=>void load(true);window.addEventListener('focus',focus);return()=>{request.current++;busy.current=false;clearInterval(timer);window.removeEventListener('focus',focus);};},[load]);
  useEffect(()=>{const url=new URL(window.location.href);for(const [key,value] of Object.entries({projectSearch:search,projectScope:scope,projectPm:pm,projectOffice:office,projectStatus:status,projectSort:sort})){if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);}window.history.replaceState(null,'',url);},[search,scope,pm,office,status,sort]);
  if(legacyProject) return <ProjectDetail projectId={legacyProject} onBack={()=>{setLegacyProject(null);const url=new URL(location.href);url.searchParams.delete('projectId');window.history.replaceState(null,'',url);void load();}}/>;
  const filtered=rows.filter(row=>{
    const project=row.project;
    return (status==='all'||status==='open'&&['planning','active'].includes(project.status)||status===project.status)
      && (scope!=='mine'||project.assigned_pm===profile?.id)&&(scope!=='unassigned'||!project.assigned_pm)
      &&(!pm||project.assigned_pm===pm)&&(!office||project.office_id===office)
      &&`${row.customer} ${project.name} ${project.project_number}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a,b)=>{
    if(sort==='goal') return (b.percentage??-1)-(a.percentage??-1)||a.customer.localeCompare(b.customer);
    if(sort==='untouched') return (a.lastWorked||'').localeCompare(b.lastWorked||'')||a.customer.localeCompare(b.customer);
    if(sort==='tasks') return b.openTasks.length-a.openTasks.length||a.customer.localeCompare(b.customer);
    if(sort==='date') return (a.project.target_completion_date||'9999').localeCompare(b.project.target_completion_date||'9999');
    return a.customer.localeCompare(b.customer)||a.project.name.localeCompare(b.project.name);
  });
  const managers=[...new Map(rows.filter(row=>row.project.assigned_pm).map(row=>[row.project.assigned_pm,row.pm])).entries()];
  const offices=[...new Map(rows.filter(row=>row.project.office_id).map(row=>[row.project.office_id,row.office])).entries()];
  const daysSince=(value:string,today:string)=>Math.max(0,Math.round((Date.parse(today)-Date.parse(value.slice(0,10)))/86400000));
  return <section className="pm-dashboard" aria-label="Project management dashboard">
    <header className="pm-heading"><div><h1>Projects</h1><p>Customer and project overview · Recorded labor, remaining tasks and visits</p></div><button aria-label="Refresh projects" title="Refresh projects" onClick={()=>void load()} disabled={loading}><RefreshCw size={18}/></button></header>
    <div className="pm-filters">
      <label className="pm-search"><span>Search customer or project</span><div><Search size={16}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Customer, project or number"/></div></label>
      <label>Projects<select aria-label="Projects" value={scope} onChange={event=>{setScope(event.target.value);setPm('');}}><option value="all">All projects</option><option value="mine">My projects</option><option value="unassigned">Unassigned</option></select></label>
      <label>Project Manager<select value={pm} onChange={event=>{setPm(event.target.value);setScope('all');}}><option value="">All managers</option>{managers.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Office<select value={office} onChange={event=>setOffice(event.target.value)}><option value="">All offices</option>{offices.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="open">Open projects</option><option value="planning">Planning</option><option value="active">Active</option><option value="complete">Complete</option><option value="closed">Closed</option><option value="all">All statuses</option></select></label>
      <label>Sort by<select value={sort} onChange={event=>setSort(event.target.value)}><option value="goal">Goal used · highest first</option><option value="untouched">Longest untouched</option><option value="date">Target completion</option><option value="tasks">Most tasks remaining</option><option value="customer">Customer / project</option></select></label>
    </div>
    <p className="pm-help">Labor used compares recorded field hours with the labor goal; it does not measure task completion. Over-goal hours remain visible. Open timers are shown separately.</p>
    <div className="pm-totals"><span>{filtered.length} projects shown</span><span>{filtered.filter(row=>(row.percentage||0)>100).length} over goal</span><span>{filtered.filter(row=>!row.project.assigned_pm).length} unassigned</span><span>{filtered.filter(row=>row.openTasks.length&&!row.nextVisit).length} with tasks and no visit scheduled</span></div>
    {error&&<div role="alert" className="pm-error">{error} <button onClick={()=>void load()}>Retry</button></div>}
    {(authLoading||loading)&&<p role="status">Loading projects…</p>}
    {!authLoading&&!loading&&!error&&!filtered.length&&<p className="pm-empty">No projects match these filters.</p>}
    <div className="pm-list">{filtered.map(row=>{
      const project=row.project, over=(row.remainingHours??0)<0, open=expanded===project.id;
      return <article className="pm-card" key={project.id}>
        <div className="pm-row">
          <div className="pm-identity"><strong>{row.customer}</strong><a href={projectOrderLink(row)}>{project.name}</a><small>{project.project_number} · {project.status}{!project.sales_order_id?' · No linked sales order':''}</small></div>
          <div className="pm-cell"><span className="pm-label">PM / Office</span><strong>{row.pm}</strong><small>{row.office}</small></div>
          <div className="pm-cell pm-labor"><span className="pm-label">Labor used / Goal</span><strong>{hours(row.fieldHours)} / {row.goalHours!=null?hours(row.goalHours):'No goal set'}</strong><small className={over?'pm-warning':''}>{row.percentage!=null?`${row.percentage.toFixed(0)}% used · ${hours(Math.abs(row.remainingHours!))} ${over?'over goal':'to goal'}`:row.budgetWarning||'Not ranked'}</small><div className="pm-progress" aria-hidden="true"><span className={over?'pm-over':''} style={{width:`${Math.min(100,row.percentage||0)}%`}}/></div>{row.pendingHours>0&&<small>{hours(row.pendingHours)} awaiting time review</small>}</div>
          <div className="pm-cell"><span className="pm-label">Last worked</span><strong>{row.lastWorked?date(row.lastWorked):'Not worked yet'}</strong>{row.lastWorked&&<small>{daysSince(row.lastWorked,row.today)} days ago</small>}{row.activeTimers>0&&<small>{row.activeTimers} timer{row.activeTimers===1?'':'s'} running</small>}</div>
          <div className="pm-cell"><span className="pm-label">Tasks remaining</span><strong>{row.tasks.length?`${row.openTasks.length} open`:'No task list'}</strong>{row.blockedTasks>0&&<small className="pm-warning">{row.blockedTasks} blocked</small>}<small>{row.workOrders.length} open work orders</small></div>
          <div className="pm-cell"><span className="pm-label">Next visit / Target</span><strong>{row.nextVisit?date(row.nextVisit.scheduled_date):'Nothing scheduled'}</strong>{row.nextVisit&&<small>{row.nextVisit.technician_name||'Assigned technician'} · {row.nextVisit.scheduled_start_time?.slice(0,5)}</small>}<small>Target: {project.target_completion_date?date(project.target_completion_date):'Not set'}</small></div>
          <button className="pm-expand" aria-expanded={open} aria-controls={`pm-details-${project.id}`} aria-label={`${open?'Hide':'Show'} tasks and work orders for ${project.name}`} onClick={()=>setExpanded(open?null:project.id)}>{open?<ChevronUp size={18}/>:<ChevronDown size={18}/>}<span>Details</span></button>
        </div>
        {open&&<div className="pm-details" id={`pm-details-${project.id}`}>
          <section><h2>Remaining tasks</h2>{!row.tasks.length?<p>No structured tasks yet.</p>:!row.openTasks.length?<p>All project tasks are complete or cancelled.</p>:<ul>{row.openTasks.map(task=><li key={task.id}><strong>{task.title}</strong><small>{task.room_name||'General / Unassigned'} · {task.progress_status||'Open'}{task.estimated_hours>0?` · ${hours(Number(task.estimated_hours))} estimated`:''}</small>{task.description&&<p>{task.description}</p>}</li>)}</ul>}</section>
          <section><h2>Open work orders</h2>{!row.workOrders.length?<p>No open work orders.</p>:<ul>{row.workOrders.map(wo=><li key={wo.id}><a href={`/?tab=work_orders&workOrderId=${encodeURIComponent(wo.id)}`}>{wo.work_order_number} · {wo.title}</a><small>{wo.status_label?.replace(/_/g,' ')} · {wo.technician_name||'Unassigned'} · {wo.scheduled_date&&wo.scheduled_start_time?`${date(wo.scheduled_date)} ${wo.scheduled_start_time.slice(0,5)}`:'Unscheduled'}</small></li>)}</ul>}<p>Excluded labor: {hours(row.excludedHours)}</p><a href={projectOrderLink(row)}>Open Sales Order → Project</a></section>
        </div>}
      </article>;
    })}</div>
  </section>;
}
