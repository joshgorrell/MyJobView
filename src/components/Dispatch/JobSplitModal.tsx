import { notifyTechJobAssigned } from '../../lib/dispatchNotifications';
import { useEffect, useRef, useState } from 'react';
import { Plus, Split, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { QuickActionModal } from '../Shared/QuickActionModal';
import { WorkOrderSchedulePicker } from '../Production/WorkOrderSchedulePicker';
import { overlappingBookings, type CalendarBooking, type ScheduleSelection } from '../../lib/workOrderScheduling';

interface WorkOrder { id: string; work_order_number: string; title: string; estimated_hours: number; assigned_to: string | null; start_date: string | null }
interface Part { id: string; description: string; hours: string; technicianIds: string[]; schedule: ScheduleSelection; error: string | null }
export function JobSplitModal({ workOrder, onClose, onSuccess }: { workOrder: WorkOrder; onClose: () => void; onSuccess: () => void }) {
  const { profile } = useAuth();
  const [techs, setTechs] = useState<Array<{ id: string; full_name: string }>>([]);
  const [type, setType] = useState('multi_task');
  const [reason, setReason] = useState('');
  const blank = (): Part => ({ id: crypto.randomUUID(), description: '', hours: '', technicianIds: workOrder.assigned_to ? [workOrder.assigned_to] : [], schedule: { date: '', start: '', end: '' }, error: 'Choose an available booking.' });
  const [parts, setParts] = useState<Part[]>(() => [blank(), blank()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const key = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const exclude = useRef([workOrder.id]);
  useEffect(() => { let active = true; supabase.from('profiles').select('id,full_name').eq('organization_id', profile?.organization_id).eq('is_technician', true).eq('is_active', true).order('full_name').then(({ data, error }) => {
    if (active) { if (error) setError('Technicians could not be loaded. Close and retry.'); else setTechs(data || []); }
  }); return () => { active = false; }; }, [profile?.organization_id]);
  const update = (id: string, value: Partial<Part>) => setParts(current => {
    const target = current.find(part => part.id === id);
    if (!target || Object.entries(value).every(([key, next]) => Object.is(target[key as keyof Part], next))) return current;
    return current.map(part => part.id === id ? { ...part, ...value } : part);
  });
  const bookings: CalendarBooking[] = parts.map(part => ({ id: part.id, technicianId: part.technicianIds[0], date: part.schedule.date, start: part.schedule.start, end: part.schedule.end, title: part.description, kind: 'work_order' }));
  const overlaps = parts.some(part => overlappingBookings(bookings.filter(item => item.id !== part.id), part.technicianIds, part.schedule).length);
  const valid = parts.every(part => part.description.trim() && Number(part.hours) > 0 && Number.isFinite(Number(part.hours)) && part.technicianIds.length === 1 && techs.some(tech => tech.id === part.technicianIds[0]) && part.schedule.date && part.schedule.start && part.schedule.end && !part.error) && !overlaps;
  async function save() {
    if (!valid || submitting.current) return;
    submitting.current = true; setSaving(true); setError('');
    try {
      const { data, error } = await supabase.rpc('split_scheduled_work_order', { p_source_id: workOrder.id, p_request_id: key.current, p_split_type: type, p_reason: reason,
        p_parts: parts.map(part => ({ description: part.description.trim(), estimated_hours: Number(part.hours), assigned_to: part.technicianIds[0], ...part.schedule })) });
      if (error) throw error;
      for (const [index, part] of parts.entries()) await notifyTechJobAssigned(part.technicianIds[0], { work_order_number: data?.[index]?.work_order_number || '', title: part.description.trim(), scheduled_date: part.schedule.date });
      onSuccess(); onClose();
    } catch (e) { setError((e as { message?: string }).message || 'Unable to split this work order. Try again.'); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <QuickActionModal title="Split job" subtitle={workOrder.work_order_number + ' · ' + workOrder.title} icon={<Split />} scrollBody={false} onClose={() => { if (!saving) onClose(); }}>
    <div className="flex flex-col min-h-0">
      <div className="overflow-y-auto min-h-0 p-4 space-y-4">
        <p className="text-sm text-secondary">Schedule every part before saving. The original booking is cancelled when all parts are created; its history is preserved.</p>
        <label className="block text-sm">Split type<select aria-label="Split type" value={type} onChange={e => setType(e.target.value)} className="block w-full rounded-lg border border-subtle bg-canvas p-2"><option value="multi_task">Separate tasks</option><option value="multi_day">Multiple days</option><option value="multi_tech">Multiple technicians</option></select></label>
        <label className="block text-sm">Reason<textarea aria-label="Split reason" value={reason} onChange={e => setReason(e.target.value)} className="block w-full rounded-lg border border-subtle bg-canvas p-2" /></label>
        {parts.map((part, index) => <section key={part.id} className="rounded-xl border border-subtle p-3 space-y-3">
          <div className="flex justify-between items-center"><h3 className="font-semibold">Part {index + 1}</h3>{parts.length > 2 && <button type="button" aria-label={'Remove part ' + (index + 1)} onClick={() => setParts(current => current.filter(item => item.id !== part.id))} className="p-2"><Trash2 size={18} /></button>}</div>
          <label className="block text-sm">Description<input aria-label={'Part ' + (index + 1) + ' description'} value={part.description} onChange={e => update(part.id, { description: e.target.value })} className="block w-full rounded-lg border border-subtle bg-canvas p-2" /></label>
          <label className="block text-sm">Estimated hours<input aria-label={'Part ' + (index + 1) + ' estimated hours'} type="number" min="0.1" step="0.1" value={part.hours} onChange={e => update(part.id, { hours: e.target.value })} className="block w-full rounded-lg border border-subtle bg-canvas p-2" /></label>
          <WorkOrderSchedulePicker organizationId={profile?.organization_id} technicians={techs} technicianIds={part.technicianIds} onTechniciansChange={ids => update(part.id, { technicianIds: ids.slice(-1) })} value={part.schedule} onChange={schedule => update(part.id, { schedule })} onValidationChange={error => update(part.id, { error })} excludeWorkOrderIds={exclude.current} initialMode="manual" />
        </section>)}
        <button type="button" disabled={parts.length >= 50 || saving} onClick={() => setParts(current => [...current, blank()])} className="flex items-center gap-2 min-h-11"><Plus size={18} />Add part</button>
        {overlaps && <p role="alert" className="text-danger text-sm">Parts for the same technician cannot overlap.</p>}
        {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      </div>
      <div className="shrink-0 p-4 border-t border-subtle flex gap-3">
        <button type="button" disabled={saving} onClick={onClose} className="flex-1 min-h-11 rounded-lg border border-subtle">Cancel</button>
        <button type="button" disabled={saving || !valid} onClick={save} className="flex-1 min-h-11 rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Create ' + parts.length + ' parts'}</button>
      </div>
    </div>
  </QuickActionModal>;
}
