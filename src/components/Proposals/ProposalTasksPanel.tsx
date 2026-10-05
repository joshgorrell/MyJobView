import {useJobDraft} from '../../lib/useJobDraft';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { TaskGroups, ScopeTask } from '../Shared/TaskGroups';
import { X, Plus } from 'lucide-react';

type Task = ScopeTask & { line_item_id: string | null; labor_phase_id: string | null; covered_item_ids: string[] };
type Item = { id: string; description: string; room_id: string | null; labor_hours: number | null; programming_labor_hours: number | null; quantity: number };
export default function ProposalTasksPanel({ proposalId, onClose }: { proposalId: string; lineItems: Array<{ id: string; description: string }>; onClose: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [phases, setPhases] = useState<Array<{ id: string; name: string }>>([]);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [editing, setEditing] = useJobDraft<Task>(`mjv-proposal-task-draft:${proposalId}`);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const [taskResult, itemResult, roomResult, phaseResult] = await Promise.all([
        supabase.from('proposal_tasks').select('*').eq('proposal_id', proposalId).order('sort_order'),
        supabase.from('proposal_line_items').select('id,description,room_id,labor_hours,programming_labor_hours,quantity').eq('proposal_id', proposalId).order('sort_order'),
        supabase.from('proposal_rooms').select('id,name').eq('proposal_id', proposalId).order('sort_order'),
        supabase.from('labor_phases').select('id,name').order('sort_order'),
      ]);
      for (const result of [taskResult,itemResult,roomResult,phaseResult]) if(result.error) throw result.error;
      const values = itemResult.data || [], roomValues = roomResult.data || [], phaseValues = phaseResult.data || [];
      setItems(values); setRooms(roomValues); setPhases(phaseValues);
      setTasks((taskResult.data || []).map(task => ({ ...task, room_name: roomValues.find(room => room.id === values.find(item => item.id === task.line_item_id)?.room_id)?.name, phase_name: phaseValues.find(phase => phase.id === task.labor_phase_id)?.name })));
      setError('');
    } catch (failure) { setError((failure as {message?:string}).message || 'Tasks could not be loaded.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [proposalId]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editing || saving) return; setSaving(true);
    const values = {estimate_is_manual:true, title: editing.title.trim(), description: editing.description || null, estimated_hours: editing.estimated_hours, line_item_id: editing.line_item_id || null, labor_phase_id: editing.labor_phase_id || null, covered_item_ids: editing.covered_item_ids || [] };
    const result = editing.id ? await supabase.from('proposal_tasks').update(values).eq('id',editing.id) : await supabase.from('proposal_tasks').insert({ ...values, proposal_id: proposalId, sort_order: tasks.length });
    setSaving(false); if(result.error) { setError(result.error.message); return; } setEditing(null); await load();
  }
  async function remove(task: Task) {
    if(!window.confirm(`Delete "${task.title}"? It will remain excluded after labor edits.`)) return;
    const {error: failure} = await supabase.from('proposal_tasks').delete().eq('id',task.id);
    if(failure) setError(failure.message); else await load();
  }
  return <section className="bg-surface text-primary p-4 space-y-4">
    <div className="flex justify-between items-center"><h2 className="font-semibold">Proposal tasks</h2><button onClick={onClose} aria-label="Close proposal tasks" className="min-h-11 min-w-11"><X className="w-5 h-5" /></button></div>
    {error && <p role="alert" className="text-red-600 text-sm">{error}<button onClick={load} className="underline min-h-11 ml-2">Retry</button></p>}
    {loading && <p className="text-muted text-sm">Loading tasks...</p>}
    <button onClick={() => setEditing({id:'',title:'',description:'',estimated_hours:null,line_item_id:null,labor_phase_id:null,covered_item_ids:[]})} className="min-h-11 flex items-center gap-2 text-info"><Plus className="w-4 h-4"/>Add task</button>
    {editing && <form onSubmit={save} className="space-y-3 rounded-lg border border-subtle p-3">
      <label className="block text-sm">Title<input required value={editing.title} onChange={event => setEditing({...editing,title:event.target.value})} className="block w-full bg-surface border border-subtle rounded-lg p-2 mt-1"/></label>
      <label className="block text-sm">Instructions<textarea value={editing.description || ''} onChange={event=>setEditing({...editing,description:event.target.value})} className="block w-full bg-surface border border-subtle rounded-lg p-2 mt-1" rows={3}/></label>
      <div className="grid sm:grid-cols-2 gap-3"><label className="block text-sm">Primary item<select value={editing.line_item_id || ''} onChange={event=>setEditing({...editing,line_item_id:event.target.value || null})} className="block w-full bg-surface border border-subtle rounded-lg p-2 mt-1"><option value="">General task</option>{items.map(item=><option key={item.id} value={item.id}>{item.description}</option>)}</select></label><label className="block text-sm">Labor phase<select value={editing.labor_phase_id || ''} onChange={event=>setEditing({...editing,labor_phase_id:event.target.value || null})} className="block w-full bg-surface border border-subtle rounded-lg p-2 mt-1"><option value="">No phase</option>{phases.map(phase=><option key={phase.id} value={phase.id}>{phase.name}</option>)}</select></label></div>
      <label className="block text-sm">Estimated hours<input type="number" min="0" step="0.1" value={editing.estimated_hours ?? ''} onChange={event=>setEditing({...editing,estimated_hours:event.target.value === '' ? null : Number(event.target.value)})} placeholder="Not estimated" className="block w-full bg-surface border border-subtle rounded-lg p-2 mt-1"/></label>
      <details><summary className="min-h-11 cursor-pointer text-sm text-info">Covered equipment / combined package</summary><p className="text-sm text-muted">Select all items this task covers. Remove redundant tasks and allocate the combined estimate once.</p>{items.map(item=><label key={item.id} className="flex gap-2 min-h-11 items-center text-sm"><input type="checkbox" checked={(editing.covered_item_ids || []).includes(item.id)} onChange={event=>setEditing({...editing,covered_item_ids:event.target.checked ? [...(editing.covered_item_ids || []),item.id] : editing.covered_item_ids.filter(id=>id!==item.id)})}/>{item.description}</label>)}</details>
      <div className="flex gap-2"><button disabled={saving} type="submit" className="bg-blue-600 text-white rounded-lg px-4 min-h-11">{saving ? 'Saving...' : 'Save'}</button><button type="button" onClick={()=>setEditing(null)} className="min-h-11 px-4 text-secondary">Cancel</button></div>
    </form>}
    <TaskGroups tasks={[...tasks].sort((a,b)=>rooms.findIndex(room=>room.name===a.room_name)-rooms.findIndex(room=>room.name===b.room_name))} renderDetails={task=><p className="text-xs text-muted py-2">Covered items: {items.filter(item=>item.id===task.line_item_id || task.covered_item_ids?.includes(item.id)).map(item=>item.description).join(', ') || 'General work'}</p>} renderActions={task=><div className="flex gap-2"><button onClick={()=>setEditing(task)} className="min-h-11 px-3 text-info">Edit</button><button onClick={()=>remove(task)} className="min-h-11 px-3 text-red-600">Delete</button></div>}/>
  </section>;
}
