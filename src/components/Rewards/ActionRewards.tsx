import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type Settings = { enabled: boolean; invoice_points_per_dollar: number; job_clock_points: number; review_points: number; value_points: number; value_dollars: number };
type Data = { settings: Settings; attendance: { early: number; on_time: number; late: number; very_late: number } | null; photo_points: number };

const number = (n: number, decimals = 2) => Number(n).toLocaleString('en-US', { maximumFractionDigits: decimals });
const money = (n: number) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const inputClass = 'mt-1 w-full min-w-0 rounded-lg border border-gray-600 bg-gray-900 p-2 text-white';

export function ActionRewards({ admin = false, onTimePoints }: { admin?: boolean; onTimePoints?: number }) {
  const { profile } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const pending = useRef(false);
  const load = useCallback(async () => {
    if (!profile?.id || !profile.organization_id) return;
    const request = ++version.current;
    setError('');
    try {
      const rules = await supabase.rpc('get_employee_action_rewards');
      if (rules.error) throw rules.error;
      const result = rules.data as Data;
      if (!result?.settings || !Number.isFinite(Number(result.settings.invoice_points_per_dollar))) throw new Error('Action rules returned an invalid response.');
      if (request !== version.current) return;
      setData(result);setForm(result.settings);
    } catch (e) { if (request === version.current) setError(e instanceof Error ? e.message : 'Action rewards could not be loaded. Please retry.'); }
  }, [profile?.id, profile?.organization_id]);
  useEffect(() => {
    setData(null);setForm(null);setMessage('');void load();
    const generation = version;
    return () => { generation.current++; };
  }, [load]);
  async function mutate(name: string, args: Record<string, unknown>, success: string) {
    if (pending.current) return;
    const request = version.current;
    pending.current = true;setBusy(true);setError('');setMessage('');
    try {
      const result = await supabase.rpc(name, args);
      if (result.error) throw result.error;
      if (request !== version.current) return;
      setMessage(success);await load();
    } catch (e) { if (request === version.current) setError(e instanceof Error ? e.message : 'Could not save. Refresh to check the result, then retry.'); }
    finally { pending.current = false;setBusy(false); }
  }
  const shown = admin ? form : data?.settings;
  const hourlyExample = (onTimePoints ?? data?.attendance?.on_time ?? 0) * 65 + (shown?.job_clock_points ?? 0) * 130;
  const equivalent = (points: number) => shown ? points / shown.value_points * shown.value_dollars : 0;
  return <section aria-label="Action rewards" className="space-y-4 rounded-xl border border-gray-700 bg-gray-800 p-4 sm:p-6 min-w-0">
    <div className="flex flex-wrap justify-between gap-3"><h3 className="text-lg font-semibold text-white">Action Points</h3><button type="button" disabled={busy} className="text-cyan-400 underline disabled:opacity-50" onClick={() => void load()}>Refresh action values</button></div>
    {error && <div role="alert" className="text-red-300 break-words">{error} <button type="button" className="underline" disabled={busy} onClick={() => void load()}>Retry action values</button></div>}
    {message && <p role="status" className="text-green-300">{message}</p>}
    {!data && !error && <p className="text-sm text-gray-400">Loading action values…</p>}
    {shown && <>
      <p className="text-sm text-gray-300">Points follow the action, regardless of an employee’s role. Invoice payments, job clock-ins, verified customer reviews, photos and existing activities add to the same balance.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-300">
        <p>Invoice payment: <strong className="text-cyan-300">{number(shown.invoice_points_per_dollar, 8)} points / $1 collected before tax</strong></p>
        <p>Job clock-in: <strong className="text-cyan-300">{number(shown.job_clock_points)} points</strong> per distinct job per day</p>
        <p>Excellent Job Review: <strong className="text-cyan-300">{number(shown.review_points)} points</strong> on customer submission</p>
        <p>Job photo/video: <strong className="text-cyan-300">{number(data?.photo_points ?? 0)} points</strong> per upload, using the existing rule</p>
      </div>
      {!shown.enabled && <p className="text-amber-300 text-sm">New invoice, job clock and review awards are paused. Existing activity rules continue.</p>}
      <p className="text-xs text-gray-400">{number(shown.value_points)} points = {money(shown.value_dollars)} reference reward value. Catalog items retain their configured point prices. No individual points goals or quarterly qualification apply.</p>
      {admin && form && <>
        <form className="space-y-3" onSubmit={e => { e.preventDefault();void mutate('save_employee_action_rewards', { p_enabled: form.enabled, p_invoice_rate: form.invoice_points_per_dollar, p_job_points: form.job_clock_points, p_review_points: form.review_points, p_value_points: form.value_points, p_value_dollars: form.value_dollars }, 'Action points saved. New payments and job awards use the new values.'); }}>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.enabled} disabled={busy} onChange={e => setForm({ ...form, enabled: e.target.checked })} />Enable invoice, job clock and review points</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {([
              ['invoice_points_per_dollar', 'Invoice points per $1 before tax', 0, 1000, 0.00000001],
              ['job_clock_points', 'Job clock-in points', 0, 100000, 1],
              ['review_points', 'Excellent Job Review points', 0, 100000, 1],
              ['value_points', 'Reference points', 1, 1000000, 1],
              ['value_dollars', 'Reference reward value ($)', 0.01, 999999.99, 0.01],
            ] as const).map(([key, label, min, max, step]) => <label key={key} className="text-sm text-gray-300">{label}<input required type="number" min={min} max={max} step={step} disabled={busy} value={form[key]} onChange={e => setForm({ ...form, [key]: Number(e.target.value) })} className={inputClass} /></label>)}
          </div>
          <p className="text-xs text-gray-400">Zero disables an action. Existing payment/job awards retain their original values for corrections. Attendance and photo amounts remain editable in the existing fields below.</p>
          <button disabled={busy} className="rounded-lg bg-cyan-700 px-4 py-2 text-white disabled:opacity-50">Save action points</button>
        </form>
        <div className="rounded-lg bg-gray-900 p-4 space-y-2">
          <h4 className="font-semibold text-white">Earning-value check</h4>
          <p className="text-xs text-gray-400">Examples for tuning action values, not employee targets. Other activities earn additional points.</p>
          <p className="text-sm text-gray-300">65 on-time days + 130 job clock-ins: {number(hourlyExample)} points ≈ {money(equivalent(hourlyExample))}</p>
          <p className="text-sm text-gray-300">$224,482.04 in pre-tax invoice payments: {number(224482.04 * form.invoice_points_per_dollar)} points ≈ {money(equivalent(224482.04 * form.invoice_points_per_dollar))}</p>
        </div>
      </>}
    </>}
  </section>;
}
