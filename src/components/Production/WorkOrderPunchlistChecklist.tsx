import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export interface VisitPunchlistItem {
  id: string; description: string; status: string; updated_at: string;
  customer_notes: string | null; internal_notes: string | null; previous_visit_notes?: string | null;
  completion_notes: string | null; visit_result: string | null; remaining_work: string | null;
  photos: Array<{ id: string; photo_url: string }>;
}

export default function WorkOrderPunchlistChecklist({ workOrderId, contactId, readOnly = false }: {
  workOrderId: string; contactId?: string | null; readOnly?: boolean;
}) {
  const [items, setItems] = useState<VisitPunchlistItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const generation = useRef(0);
  const writing = useRef(false);

  async function load() {
    const request = ++generation.current;
    try {
      const { data, error: failure } = await supabase.rpc('get_work_order_punchlist', { p_work_order_id: workOrderId });
      if (failure) throw failure;
      if (request === generation.current) { setItems(data || []); setError(''); }
    } catch (failure) {
      if (request === generation.current) setError((failure as { message?: string }).message || 'Customer Punchlist could not be loaded.');
    } finally { if (request === generation.current) setLoading(false); }
  }
  useEffect(() => {
    setItems([]); setNotes({}); setLoading(true); void load();
    const channel = supabase.channel(`work-order-punchlist-${workOrderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order_punchlist_items', filter: `work_order_id=eq.${workOrderId}` }, load);
    if (contactId) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'punchlist_tasks', filter: `contact_id=eq.${contactId}` }, load);
    channel.subscribe();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refresh); window.addEventListener('online', refresh);
    return () => { generation.current++; channel.unsubscribe(); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [workOrderId, contactId]);

  async function report(item: VisitPunchlistItem, outcome: 'completed' | 'unfinished') {
    if (writing.current) return;
    if (!navigator.onLine) { setError('Reconnect to save Customer Punchlist progress.'); return; }
    const note = notes[item.id]?.trim() || '';
    if (outcome === 'unfinished' && !note) { setError('Explain what remains before marking an item unfinished.'); return; }
    writing.current = true; setSaving(item.id); setError('');
    try {
      const { error: failure } = await supabase.rpc('report_work_order_punchlist', {
        p_work_order_id: workOrderId, p_task_id: item.id, p_outcome: outcome,
        p_notes: note || null, p_expected_updated_at: item.updated_at,
      });
      if (failure) throw failure;
      setNotes(previous => ({ ...previous, [item.id]: '' })); await load();
    } catch (failure) {
      setError((failure as { message?: string }).message || 'The item could not be saved.');
    } finally { writing.current = false; setSaving(null); }
  }

  if (!loading && !error && !items.length) return null;
  return <section aria-label="Customer Punchlist" className="space-y-3 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold text-primary flex items-center gap-2"><ClipboardList className="w-5 h-5" />Customer Punchlist</h2>
      {!!items.length && <span className="text-sm text-secondary">{items.filter(item => item.status === 'completed').length} of {items.length} complete</span>}
    </div>
    <p className="text-sm text-secondary">Original customer items for this visit. Updates are shared with the other assigned technicians.</p>
    {loading && <p className="text-sm text-muted">Loading Customer Punchlist…</p>}
    {error && <div role="alert" className="text-sm text-red-600"><p>{error}</p><button type="button" onClick={() => void load()} className="min-h-11 underline">Refresh items</button></div>}
    {items.map((item, index) => <article key={item.id} className="border border-subtle bg-surface rounded-xl p-3 sm:p-4 space-y-3 min-w-0">
      <div className="flex gap-2 items-start">
        {item.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" /> : <span className="font-semibold text-secondary shrink-0">{index + 1}.</span>}
        <h3 className="font-semibold text-primary whitespace-pre-wrap break-words">{item.description}</h3>
      </div>
      {item.customer_notes && <p className="text-sm text-secondary whitespace-pre-wrap break-words"><strong>Customer note:</strong> {item.customer_notes}</p>}
      {item.internal_notes && <p className="text-sm text-secondary whitespace-pre-wrap break-words border-l-2 border-amber-500 pl-3"><strong>Internal work note:</strong> {item.internal_notes}</p>}
      {item.previous_visit_notes && <p className="text-sm text-secondary whitespace-pre-wrap break-words"><strong>Earlier visit remaining work:</strong> {item.previous_visit_notes}</p>}
      {!!item.photos?.length && <div className="flex flex-wrap gap-2">{item.photos.filter(photo => /^https:\/\//i.test(photo.photo_url)).map(photo => <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer"><img src={photo.photo_url} alt={`Customer photo for item ${index + 1}`} className="w-20 h-20 object-cover rounded-lg border border-subtle" /></a>)}</div>}
      {item.status === 'completed' ? <div className="text-sm text-green-700"><p>Completed</p>{item.completion_notes && <p className="whitespace-pre-wrap break-words mt-1">{item.completion_notes}</p>}</div> : <>
        {item.visit_result === 'unfinished' && <p className="text-sm text-amber-700 whitespace-pre-wrap break-words">Unfinished this visit: {item.remaining_work}</p>}
        {!readOnly && <>
          <label className="block text-sm text-secondary">Item notes<textarea aria-label={`Notes for Punchlist item ${index + 1}`} value={notes[item.id] || ''}
            onChange={event => setNotes(previous => ({ ...previous, [item.id]: event.target.value }))} rows={2}
            className="block w-full mt-1 p-2 rounded-lg border border-subtle bg-surface text-primary text-base" /></label>
          <p className="text-xs text-muted">All technician notes stay internal. The customer sees item status only.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving !== null} onClick={() => void report(item, 'completed')} className="min-h-11 px-4 bg-green-600 text-white rounded-lg disabled:opacity-50">{saving === item.id ? 'Saving…' : 'Mark Complete'}</button>
            <button type="button" disabled={saving !== null} onClick={() => void report(item, 'unfinished')} className="min-h-11 px-4 border border-subtle text-primary rounded-lg disabled:opacity-50">Unfinished / Needs Follow-up</button>
          </div>
        </>}
      </>}
    </article>)}
  </section>;
}
