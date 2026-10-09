import LegacyHandoffReview from './LegacyHandoffReview';
import {useJobDraft} from '../../lib/useJobDraft';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { TaskGroups, ScopeTask } from '../Shared/TaskGroups';
type Task = ScopeTask & { labor_phase_id: string | null; progress_status: string; status: string };
type Activity = { id:string; project_task_id:string; disposition:string; notes:string|null; created_at:string };
export default function ProjectTasksList({ projectId, canEdit=false }: {projectId:string; canEdit?:boolean}) {
 const [modern,setModern]=useState(false);
 const [tasks,setTasks]=useState<Task[]>([]);
 const [history,setHistory]=useState<Activity[]>([]);
 const [phases,setPhases]=useState<Array<{id:string;name:string}>>([]);
 const [editing,setEditing]=useJobDraft<Task>(`mjv-project-task-draft:${projectId}`);
 const [error,setError]=useState(''); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
 async function load() {
  setLoading(true);
  try {
   const [taskResult,phaseResult]=await Promise.all([supabase.from('project_tasks').select('*').eq('project_id',projectId).order('sort_order'),supabase.from('labor_phases').select('id,name').order('sort_order')]);
   if(taskResult.error) throw taskResult.error;if(phaseResult.error) throw phaseResult.error;
   const phaseValues=phaseResult.data||[], values=taskResult.data||[];setPhases(phaseValues);setModern(values.some(task=>Object.prototype.hasOwnProperty.call(task,'progress_status')));
   setTasks(values.map(task=>({...task,phase_name:phaseValues.find(phase=>phase.id===task.labor_phase_id)?.name})));
   if(values.length&&values.some(task=>Object.prototype.hasOwnProperty.call(task,'progress_status'))){ const result=await supabase.from('project_task_activity').select('*').in('project_task_id',values.map(task=>task.id)).order('created_at',{ascending:false});if(result.error)throw result.error;setHistory(result.data||[]);}else setHistory([]);
   setError('');
  }catch(failure){setError((failure as {message?:string}).message||'Tasks could not be loaded.');}finally{setLoading(false);}
 }
 useEffect(()=>{load();},[projectId]);
 async function save(event:React.FormEvent){event.preventDefault();if(!editing||saving)return;setSaving(true);
  const values={...(modern?{estimate_is_manual:true,room_name:editing.room_name||null}:{}),title:editing.title.trim(),description:editing.description||null,labor_phase_id:editing.labor_phase_id||null,estimated_hours:editing.estimated_hours||0};
  const result=editing.id ? await supabase.from('project_tasks').update(values).eq('id',editing.id) : await supabase.from('project_tasks').insert({...values,project_id:projectId,status:'open',sort_order:tasks.length});
  setSaving(false);if(result.error){setError(result.error.message);return;}setEditing(null);await load();
 }
 async function status(task:Task,value:string){if(!window.confirm(`${value==='completed'?'Complete the entire project task':value==='cancelled'?'Cancel project work':'Reopen project work'}: ${task.title}?`))return;
  const result=await supabase.from('project_tasks').update({status:value,completed_at:value==='completed'?new Date().toISOString():null,...(modern?{progress_status:value==='completed'?'completed':'pending'}:{}),is_auto_completed:false,auto_completed_by:null}).eq('id',task.id);
  if(result.error)setError(result.error.message);else await load();
 }
 return <section className="space-y-4 text-primary">
  {canEdit&&modern&&<LegacyHandoffReview projectId={projectId} onSaved={load}/>}
  {error&&<p className="text-red-600 text-sm" role="alert">{error}<button onClick={load} className="min-h-11 underline ml-2">Retry</button></p>}
  {loading&&<p className="text-muted text-sm">Loading tasks...</p>}
  {canEdit&&<button onClick={()=>setEditing({id:'',title:'',description:'',estimated_hours:null,labor_phase_id:null,status:'open',progress_status:'pending'})} className="min-h-11 px-3 text-info">Add task</button>}
  {editing&&<form onSubmit={save} className="space-y-3 border border-subtle rounded-lg p-3 bg-surface">
   <label className="block text-sm">Title<input required value={editing.title} onChange={event=>setEditing({...editing,title:event.target.value})} className="block w-full bg-surface border border-subtle rounded-lg p-2 mt-1"/></label>
   <label className="block text-sm">Instructions<textarea value={editing.description||''} onChange={event=>setEditing({...editing,description:event.target.value})} className="block w-full bg-surface border border-subtle rounded-lg p-2 mt-1" rows={3}/></label>
   {modern&&<label className="block text-sm">Room / Area<input value={editing.room_name||''} onChange={event=>setEditing({...editing,room_name:event.target.value})} className="block w-full bg-surface border border-subtle rounded-lg p-2 mt-1"/></label>}
   <label className="block text-sm">Labor phase<select value={editing.labor_phase_id||''} onChange={event=>setEditing({...editing,labor_phase_id:event.target.value||null})} className="block w-full bg-surface border border-subtle rounded-lg p-2 mt-1"><option value="">No phase</option>{phases.map(phase=><option key={phase.id} value={phase.id}>{phase.name}</option>)}</select></label>
   <label className="block text-sm">Estimated hours<input type="number" min="0" step="0.1" value={editing.estimated_hours??''} onChange={event=>setEditing({...editing,estimated_hours:event.target.value===''?null:Number(event.target.value)})} placeholder="Not estimated" className="block w-full bg-surface border border-subtle rounded-lg p-2 mt-1"/></label>
   <button type="submit" disabled={saving} className="min-h-11 bg-blue-600 text-white px-4 rounded-lg">Save</button><button type="button" onClick={()=>setEditing(null)} className="min-h-11 px-4 text-secondary">Cancel</button>
  </form>}
  <TaskGroups tasks={tasks} renderDetails={task=><><p className="text-xs text-muted">Progress: {task.progress_status||task.status}</p><ul className="space-y-2 py-2">{history.filter(row=>row.project_task_id===task.id).map(row=><li key={row.id} className="text-sm text-secondary">{new Date(row.created_at).toLocaleString()} · {row.disposition}{row.notes&&<p className="whitespace-pre-wrap">{row.notes}</p>}</li>)}</ul></>} renderActions={canEdit?task=><div className="flex flex-wrap gap-2"><button onClick={()=>setEditing(task)} className="min-h-11 px-3 text-info">Edit</button><button onClick={()=>status(task,task.status==='completed'?'open':'completed')} className="min-h-11 px-3 text-info">{task.status==='completed'?'Reopen':'Complete entire task'}</button>{task.status!=='cancelled'&&<button onClick={()=>status(task,'cancelled')} className="min-h-11 px-3 text-red-600">Cancel work</button>}</div>:undefined}/>
 </section>;
}
