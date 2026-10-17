import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { rescheduleWorkOrder } from '../../lib/scheduling';
import { ScheduleWorkOrderModal } from '../Production/ScheduleWorkOrderModal';
import { WorkOrderDetail } from '../Production/WorkOrderDetail';
import { timeLabel } from '../../lib/workOrderScheduling';

interface Item { id: string; work_order_number: string; title: string; status: string; reason: 'incomplete' | 'overdue'; technician_name: string | null; customer_name: string; assigned_to: string | null; scheduled_date: string | null; scheduled_start_time: string | null; scheduled_end_time: string | null }
function useAttention(limit: number) {
  const { profile } = useAuth();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: Item[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current; setLoading(true); setError('');
    try {
      const { data, error } = await supabase.rpc('get_work_orders_needing_attention', { p_offset: offset, p_limit: limit });
      if (error) throw error;
      if (!data || !Array.isArray(data.items)) throw new Error('Attention results were not returned.');
      if (request !== generation.current) return;
      if (offset > 0 && offset >= data.total) { setOffset(Math.max(0, Math.floor((data.total - 1) / limit) * limit)); return; }
      setData(data);
    } catch (e) { if (request === generation.current) setError((e as { message?: string }).message || 'Unable to load work orders.'); }
    finally { if (request === generation.current) setLoading(false); }
  }, [offset, limit]);
  const cancel = useCallback(() => { ++generation.current; }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 60000);
    const channel = supabase.channel('work-orders-attention-' + limit + '-' + profile?.organization_id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: 'organization_id=eq.' + profile?.organization_id }, () => { void load(); }).subscribe();
    return () => { cancel(); window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [load, limit, profile?.organization_id, cancel]);
  return { data, error, loading, load, offset, setOffset };
}
export function WorkOrdersAttentionBanner({ onOpen }: { onOpen: () => void }) {
  const { data, error, loading, load } = useAttention(1);
  if (error) return <div role="alert" className="p-3 rounded-xl border border-danger text-danger text-sm">Work-order attention checks are unavailable. <button type="button" onClick={() => { void load(); }} className="underline min-h-11">Retry</button></div>;
  if (!data || !data.total) return null;
  return <button type="button" onClick={onOpen} className="w-full flex items-center gap-3 p-4 text-left bg-amber-500/10 border border-amber-500/40 rounded-xl">
    <AlertTriangle className="shrink-0 text-amber-500" /><span className="min-w-0"><strong>{data.total} work order{data.total === 1 ? '' : 's'} need attention</strong><span className="block text-sm text-secondary">Review incomplete schedules and unfinished visits past their end time.</span></span>{loading && <RefreshCw size={16} className="shrink-0 animate-spin" />}
  </button>;
}
export function WorkOrdersAttention() {
  const { profile } = useAuth();
  const { data, error, loading, load, offset, setOffset } = useAttention(25);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<Item | null>(null);
  const [techs, setTechs] = useState<Array<{ id: string; full_name: string }>>([]);
  const [techError, setTechError] = useState('');
  const canSchedule = ['admin', 'manager', 'service_manager'].includes(profile?.role || '');
  useEffect(() => { let active = true; supabase.from('profiles').select('id,full_name').eq('organization_id', profile?.organization_id).eq('is_technician', true).eq('is_active', true).order('full_name').then(({ data, error }) => {
    if (active) { if (error) setTechError('Technicians could not be loaded. Refresh to retry.'); else setTechs(data || []); }
  }); return () => { active = false; }; }, [profile?.organization_id]);
  if (reviewId) return <WorkOrderDetail workOrderId={reviewId} onBack={() => { setReviewId(null); void load(); }} />;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Needs attention</h2><p className="text-sm text-secondary">Resolve existing incomplete bookings and review overdue work. No records are deleted automatically.</p></div><button type="button" aria-label="Refresh attention queue" onClick={() => { void load(); }} disabled={loading} className="p-3 rounded-lg border border-subtle"><RefreshCw size={18} /></button></div>
    {error && <p role="alert" className="p-3 text-danger border border-danger rounded-lg">{error} <button type="button" onClick={() => { void load(); }} className="underline min-h-11">Retry</button></p>}
    {techError && <p role="alert" className="text-danger text-sm">{techError}</p>}
    {loading && !data && <p role="status">Checking work orders…</p>}
    {!loading && !error && data?.total === 0 && <p className="p-6 border border-subtle rounded-xl">No work orders need attention.</p>}
    {data?.items.map(item => <article key={item.id} className="border border-subtle rounded-xl p-4 bg-canvas space-y-3">
      <div className="flex flex-wrap gap-2 items-center"><span className="text-xs rounded-full px-2 py-1 bg-amber-500/15 text-primary">{item.reason === 'incomplete' ? 'Incomplete schedule' : 'Past scheduled end'}</span><span className="text-sm text-secondary">{item.work_order_number}</span></div>
      <button type="button" onClick={() => setReviewId(item.id)} className="block text-left font-semibold min-h-11 break-words">{item.title}</button>
      <p className="text-sm text-secondary break-words">{item.customer_name} · {item.technician_name || 'No technician'}</p>
      <p className="text-sm">{item.scheduled_date || 'Date missing'} · {item.scheduled_start_time ? timeLabel(item.scheduled_start_time) : 'Start missing'} – {item.scheduled_end_time ? timeLabel(item.scheduled_end_time) : 'End missing'}</p>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setReviewId(item.id)} className="px-4 min-h-11 border border-subtle rounded-lg">Review</button>{canSchedule && <button type="button" onClick={() => setScheduling(item)} disabled={!!techError} className="px-4 min-h-11 bg-blue-600 text-white rounded-lg disabled:opacity-50">{item.reason === 'incomplete' ? 'Finish scheduling' : 'Reschedule'}</button>}</div>
    </article>)}
    {!!data?.total && <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{offset + 1}–{Math.min(offset + 25, data.total)} of {data.total}</span><div className="flex gap-2"><button type="button" disabled={loading || offset === 0} onClick={() => setOffset(offset - 25)} className="min-h-11 px-3 border border-subtle rounded-lg disabled:opacity-40">Previous</button><button type="button" disabled={loading || offset + 25 >= data.total} onClick={() => setOffset(offset + 25)} className="min-h-11 px-3 border border-subtle rounded-lg disabled:opacity-40">Next</button></div></div>}
    {scheduling && <ScheduleWorkOrderModal title="Schedule work order" organizationId={profile?.organization_id} technicians={techs} initialTechnicianId={scheduling.assigned_to} excludeWorkOrderIds={[scheduling.id]}
      initialSchedule={{ date: scheduling.scheduled_date || '', start: scheduling.scheduled_start_time?.slice(0, 5) || '', end: scheduling.scheduled_end_time?.slice(0, 5) || '' }}
      onClose={() => setScheduling(null)} onSave={async (schedule, technicianId) => {
        const result = await rescheduleWorkOrder(scheduling.id, schedule.date, schedule.start, schedule.end, technicianId);
        if (!result.success) throw new Error(result.error || 'Technician is already booked. Choose another time.');
        await load();
      }} />}
  </div>;
}
