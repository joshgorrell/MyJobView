import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatDateInTimezone, getOrganizationTimezone } from '../../lib/organizationTimezone';

type Balance = { id: string; current_balance_hours: number; policy: { id: string; policy_name: string; pto_type: string } };

export function MyTimeLeaveRequest() {
  const { profile } = useAuth();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [policyId, setPolicyId] = useState('');
  const [reason, setReason] = useState('');
  const [fullDay, setFullDay] = useState(true);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('16:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    supabase.from('pto_balances')
      .select('id,current_balance_hours,policy:pto_policies!policy_id(id,policy_name,pto_type,is_paid)')
      .eq('employee_id', profile.id).gt('current_balance_hours', 0)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError('Leave balances could not be loaded.');
        else setBalances((data ?? []) as unknown as Balance[]);
      });
    return () => { cancelled = true; };
  }, [profile?.id]);
  async function submit() {
    if (!policyId || busy) return;
    if (!fullDay && end <= start) { setError('Leave end time must be after start time.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const timezone = await getOrganizationTimezone();
      const today = formatDateInTimezone(new Date().toISOString(), timezone);
      const policy = balances.find(item => item.policy.id === policyId);
      if (!policy) throw new Error('Select a valid leave type.');
      if (!window.confirm('Submit a same-day leave request for manager approval? Same-day call-ins may affect rewards points.')) return;
      const { error } = await supabase.rpc('submit_time_off', {
        p_policy: policyId, p_start: today, p_end: today,
        p_type: fullDay ? 'full_day' : 'hours',
        p_start_time: fullDay ? null : start, p_end_time: fullDay ? null : end,
        p_reason: reason || `Same-day ${policy.policy.pto_type} call-in`,
      });
      if (error) throw error;
      setMessage('Leave request submitted for manager approval.');
      setPolicyId(''); setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Leave request could not be submitted.');
    } finally { setBusy(false); }
  }
  if (!balances.length && !error) return null;
  return <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
    <h3 className="font-semibold text-gray-900">Request Same-Day Leave</h3>
    <p className="text-sm text-gray-600">Submit a sick or vacation call-in for manager approval. This does not clock you in.</p>
    {balances.length > 0 && <>
      <label className="block text-sm text-gray-800">Leave type
        <select className="mt-1 w-full rounded border p-2" value={policyId} onChange={e => setPolicyId(e.target.value)}>
          <option value="">Select leave type</option>
          {balances.map(b => <option key={b.id} value={b.policy.id}>{b.policy.policy_name} ({b.current_balance_hours.toFixed(1)} hours)</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" checked={fullDay} onChange={e => setFullDay(e.target.checked)} />Full scheduled workday</label>
      {!fullDay && <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-gray-800">Start<input type="time" className="block w-full rounded border p-2" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label className="text-sm text-gray-800">End<input type="time" className="block w-full rounded border p-2" value={end} onChange={e => setEnd(e.target.value)} /></label>
      </div>}
      <label className="block text-sm text-gray-800">Reason (optional)<textarea className="mt-1 w-full rounded border p-2" value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button type="button" disabled={!policyId || busy} onClick={submit} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Submitting…' : 'Submit Leave Request'}</button>
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
  </section>;
}
