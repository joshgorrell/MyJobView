import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { notify } from '../../lib/feedback';

type Entry = {
  id: string; technician_id: string; entry_type: string; entry_date: string;
  clock_in: string; clock_out: string; total_hours: number; notes: string | null;
};

export function InternalTimeApprovalQueue() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [denial, setDenial] = useState<Record<string, string>>({});
  const refresh = useCallback(async () => {
    if (!profile?.is_global_admin || !profile.organization_id) return;
    setLoading(true);
    const { data, error } = await supabase.from('time_entries')
      .select('id, technician_id, entry_type, entry_date, clock_in, clock_out, total_hours, notes')
      .eq('organization_id', profile.organization_id)
      .in('entry_type', ['shop_time', 'training'])
      .eq('status', 'submitted').not('clock_out', 'is', null)
      .order('clock_out', { ascending: true }).limit(100);
    if (error) notify('Unable to load internal time approvals.', { theme: 'blue', tone: 'error' });
    else setEntries((data || []) as Entry[]);
    setLoading(false);
  }, [profile?.is_global_admin, profile?.organization_id]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function decide(entry: Entry, approve: boolean) {
    if (!profile?.is_global_admin || !profile.organization_id || busy) return;
    const reason = denial[entry.id]?.trim();
    if (!approve && !reason) {
      notify('A reason is required to deny time.', { theme: 'blue', tone: 'error' });
      return;
    }
    setBusy(entry.id);
    try {
      const { data, error } = await supabase.from('time_entries').update({
        status: approve ? 'approved' : 'rejected',
        approved_by: approve ? profile.id : null,
        approved_at: approve ? new Date().toISOString() : null,
        ...(approve ? {} : { notes: [entry.notes, `Denial reason: ${reason}`].filter(Boolean).join('\n') }),
      }).eq('id', entry.id).eq('organization_id', profile.organization_id)
        .eq('status', 'submitted').in('entry_type', ['shop_time', 'training'])
        .not('clock_out', 'is', null).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Entry was already reviewed or you do not have permission.');
      notify(approve ? 'Time approved.' : 'Time denied.', { theme: 'blue', tone: 'success' });
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Approval failed.', { theme: 'blue', tone: 'error' });
    } finally { setBusy(null); }
  }

  if (!profile?.is_global_admin) return null;
  return <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
    <h3 className="font-semibold text-gray-900">Shop & Training approvals</h3>
    {loading ? <p className="text-sm text-gray-500">Loading approvals…</p> :
      entries.length === 0 ? <p className="text-sm text-gray-500">No time awaiting approval.</p> :
      entries.map(entry => <div key={entry.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
        <p className="text-sm font-medium">{entry.entry_type === 'shop_time' ? 'Shop Time' : 'Training Time'} · {entry.entry_date} · {Number(entry.total_hours).toFixed(2)} hrs</p>
        <p className="text-xs text-gray-600">Employee ID: {entry.technician_id}</p>
        {entry.notes && <p className="text-sm text-gray-700">{entry.notes}</p>}
        <label className="block text-xs text-gray-600">Reason for denial
          <input value={denial[entry.id] || ''} onChange={event => setDenial(prev => ({ ...prev, [entry.id]: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" placeholder="Required if denying" />
        </label>
        <div className="flex gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void decide(entry, true)}
            className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Approve</button>
          <button type="button" disabled={busy !== null} onClick={() => void decide(entry, false)}
            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Deny</button>
        </div>
      </div>)}
  </section>;
}
