import { useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { QuickActionModal } from '../Shared/QuickActionModal';
import { WorkOrderSchedulePicker } from './WorkOrderSchedulePicker';
import type { ScheduleSelection } from '../../lib/workOrderScheduling';

interface Props {
  title: string;
  organizationId?: string | null;
  technicians: Array<{ id: string; full_name: string }>;
  initialTechnicianId?: string | null;
  initialSchedule?: ScheduleSelection;
  excludeWorkOrderIds?: string[];
  onSave: (schedule: ScheduleSelection, technicianId: string, requestId: string) => Promise<void>;
  onClose: () => void;
}
export function ScheduleWorkOrderModal({ title, organizationId, technicians, initialTechnicianId, initialSchedule, excludeWorkOrderIds, onSave, onClose }: Props) {
  const [schedule, setSchedule] = useState(initialSchedule || { date: '', start: '', end: '' });
  const [ids, setIds] = useState(initialTechnicianId ? [initialTechnicianId] : []);
  const [validation, setValidation] = useState<string | null>('Check availability before saving.');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  async function save() {
    if (submitting.current) return;
    submitting.current = true; setSaving(true); setError('');
    try { await onSave(schedule, ids[0], requestId.current); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the booking. Try again.'); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <QuickActionModal title={title} icon={<Calendar />} scrollBody={false} onClose={() => { if (!saving) onClose(); }}>
    <div className="flex flex-col min-h-0">
      <div className="overflow-y-auto min-h-0 p-4 space-y-3">
        <p className="text-sm text-secondary">Choose a technician and confirm the complete booking.</p>
        <WorkOrderSchedulePicker organizationId={organizationId} technicians={technicians} technicianIds={ids}
          onTechniciansChange={next => setIds(next.slice(-1))} value={schedule} onChange={setSchedule}
          onValidationChange={setValidation} excludeWorkOrderIds={excludeWorkOrderIds} initialMode="manual" />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
      <div className="shrink-0 p-4 border-t border-subtle flex gap-3">
        <button type="button" disabled={saving} onClick={onClose} className="flex-1 min-h-11 rounded-lg border border-subtle">Cancel</button>
        <button type="button" onClick={save} disabled={saving || !organizationId || ids.length !== 1 || !technicians.some(tech => tech.id === ids[0]) || !schedule.date || !schedule.start || !schedule.end || !!validation}
          className="flex-1 min-h-11 rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save booking'}</button>
      </div>
    </div>
  </QuickActionModal>;
}
