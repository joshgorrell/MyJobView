import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { notify } from '../../lib/feedback';
import { formatDateInTimezone, getOrganizationTimezone } from '../../lib/timezoneUtils';

type InternalType = 'shop_time' | 'training';
type Running = { id: string; entry_type: string | null; clock_in: string; work_order_id: string | null };

export function DirectInternalTimeClock({ type, onRefresh }: { type: InternalType; onRefresh?: () => void }) {
  const { profile } = useAuth();
  const [running, setRunning] = useState<Running | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clockError, setClockError] = useState(false);
  const [notes, setNotes] = useState('');
  const label = type === 'shop_time' ? 'Shop Time' : 'Training Time';

  const refresh = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data, error } = await supabase.from('time_entries')
      .select('id, entry_type, clock_in, work_order_id')
      .eq('technician_id', profile.id).is('clock_out', null)
      .order('clock_in', { ascending: false }).limit(1);
    setClockError(Boolean(error));
    if (error) notify('Unable to verify your active time clock.', { theme: 'blue', tone: 'error' });
    else setRunning(data?.[0] ?? null);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { void refresh(); }, [refresh, type]);

  async function start() {
    if (!profile?.id || running || loading || saving || clockError) return;
    setSaving(true);
    try {
      // Recheck before writing; the database unique index is the authoritative guard.
      const { data: existing, error: checkError } = await supabase.from('time_entries')
        .select('id').eq('technician_id', profile.id).is('clock_out', null).limit(1);
      if (checkError) throw checkError;
      if (existing?.length) throw new Error('Stop your current job, shop or training clock first.');
      const { data: company, error: companyError } = await supabase.from('company_settings').select('id').maybeSingle();
      if (companyError || !company?.id) throw companyError || new Error('Company settings unavailable.');
      const now = new Date().toISOString();
      const { error } = await supabase.from('time_entries').insert({
        company_id: company.id, technician_id: profile.id,
        entry_date: formatDateInTimezone(now, await getOrganizationTimezone()),
        clock_in: now, clock_out: null, total_hours: 0, break_minutes: 0,
        entry_type: type, status: 'draft', notes: null,
      });
      if (error) throw error;
      onRefresh?.();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to start time.', { theme: 'blue', tone: 'error' });
    } finally { setSaving(false); await refresh(); }
  }

  async function stop() {
    if (!profile?.id || !running || running.entry_type !== type || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const hours = Math.max(0, (Date.parse(now) - Date.parse(running.clock_in)) / 3600000);
      const { data, error } = await supabase.from('time_entries').update({
        clock_out: now, total_hours: Number(hours.toFixed(4)), status: 'submitted',
        notes: notes.trim() || null,
      }).eq('id', running.id).eq('technician_id', profile.id).is('clock_out', null).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('This entry was already stopped or changed. Refresh and try again.');
      // Emit a single notification after successful clock-out, never at clock-in.
      // Use a stable related_id so downstream notification handling can deduplicate.
      const { data: managers, error: managerError } = await supabase.from('profiles')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)
        .eq('is_global_admin', true);
      if (managerError) {
        console.error('Unable to resolve internal-time approvers:', managerError);
      } else if (managers?.length) {
        const label = type === 'shop_time' ? 'Shop Time' : 'Training Time';
        const { error: notificationError } = await supabase.from('notifications').insert(
          managers.map(manager => ({
            user_id: manager.id,
            organization_id: profile.organization_id,
            type: 'system',
            title: `${label} awaiting approval`,
            body: `${profile.full_name || 'A technician'} submitted ${Number(hours.toFixed(2))} hours of ${label.toLowerCase()} for manager review.`,
            related_id: data[0].id,
          }))
        );
        if (notificationError) console.error('Time submitted but manager notification failed:', notificationError);
      }
      setNotes('');
      notify('Time submitted. Manager approval is required before payroll.', { theme: 'blue', tone: 'success' });
      onRefresh?.();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to stop time.', { theme: 'blue', tone: 'error' });
    } finally { setSaving(false); await refresh(); }
  }

  const ownClock = running?.entry_type === type;
  return <div className="space-y-3">
    <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <strong>Manager approval required.</strong> {label} is only valid with manager approval. Completed entries must be approved before they are included in payroll.
    </div>
    {loading ? <p className="text-sm text-gray-500">Checking active time…</p> : <>
      {clockError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Unable to verify your active clock. Refresh the page before starting another activity.</p>}
      {running && !ownClock && <p role="status" className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">
        Another activity is already running. Stop that time entry before starting {label.toLowerCase()}.
      </p>}
      {ownClock && <>
        <p className="text-sm text-green-700">Clocked in since {new Date(running!.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
        <label className="block text-sm font-medium text-gray-700">What did you work on?
          <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2" placeholder="Add a brief description" />
        </label>
      </>}
      <button type="button" disabled={saving || clockError || Boolean(running && !ownClock)}
        onClick={() => void (ownClock ? stop() : start())}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? 'Saving…' : ownClock ? `Stop ${label}` : `Start ${label}`}
      </button>
    </>}
  </div>;
}
