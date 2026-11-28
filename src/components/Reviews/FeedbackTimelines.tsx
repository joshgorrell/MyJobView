import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const programs = [
  ['proposal_check', 'Proposal Check'],
  ['lost_opportunity', 'Lost Opportunity'],
  ['job_completion', 'Job Completion'],
  ['service_completion', 'Service Resolution'],
  ['security_onboarding', 'Security Onboarding'],
  ['support_completion', 'Support Resolution'],
  ['test_tune', 'Test & Tune'],
  ['one_year', 'Annual Check-In'],
] as const;
type Step = { delay_days: number; template_key: string };
type Draft = { timeline_key: string; steps: Step[] };

export default function FeedbackTimelines({ organizationId }: { organizationId: string }) {
  const [drafts, setDrafts] = useState<Record<string, Step[]>>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setReady(false);
    setMessage('');
    setDrafts({});
    setError('');
    void (async () => {
      try {
        const result = await supabase.from('feedback_timeline_drafts').select('timeline_key,steps').eq('organization_id', organizationId);
        if (!current) return;
        if (result.error) throw result.error;
        setDrafts(Object.fromEntries(((result.data || []) as Draft[]).map(row => [row.timeline_key, row.steps])));
        setReady(true);
      } catch {
        if (current) setError('Unable to load timeline drafts. Reload this tab to try again.');
      }
    })();
    return () => { current = false; };
  }, [organizationId]);
  const change = (key: string, steps: Step[]) => {
    setDrafts(old => ({ ...old, [key]: steps }));
    setMessage('');
    setError('');
  };
  const save = async (key: string) => {
    if (!ready || saving) return;
    const steps = drafts[key] || [];
    if (steps.length > 12 || steps.some((step, i) => !Number.isInteger(step.delay_days) || step.delay_days < 0 || step.delay_days > 365 || (i > 0 && step.delay_days <= steps[i - 1].delay_days) || !/^[a-zA-Z0-9_-]{1,100}$/.test(step.template_key))) {
      setError('Use increasing whole-number days from 0 to 365 and a valid template identifier for every step.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await supabase.from('feedback_timeline_drafts').upsert({ organization_id: organizationId, timeline_key: key, steps }, { onConflict: 'organization_id,timeline_key' });
      if (result.error) throw result.error;
      setMessage('Draft saved. No email was scheduled.');
    } catch { setError('Unable to save draft. Your edits are still here.'); }
    finally { setSaving(false); }
  };
  return <section aria-label="Feedback timelines" className="space-y-4">
    <div><h2 className="text-lg font-semibold text-white">Timelines</h2><p className="text-sm text-gray-300">Draft configuration only. Saving does not change existing automations, enroll customers or send emails. Template identifiers are provisional until template integration is available.</p></div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {message && <p role="status" className="text-green-300">{message}</p>}
    {!ready && !error && <p className="text-gray-400">Loading drafts…</p>}
    {ready && programs.map(([key, label]) => {
      const steps = drafts[key] || [];
      return <fieldset key={key} disabled={saving} className="min-w-0 space-y-3 rounded-xl border border-gray-700 bg-gray-800 p-4">
        <legend className="px-1 font-semibold text-white">{label}</legend>
        {!steps.length && <p className="text-sm text-gray-400">No draft steps configured.</p>}
        {steps.map((step, i) => <div key={i} className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-gray-200">Day<input aria-label={label + ' step ' + (i + 1) + ' day'} type="number" min={0} max={365} step={1} value={Number.isNaN(step.delay_days) ? '' : step.delay_days} onChange={e => change(key, steps.map((s, n) => n === i ? {...s, delay_days: e.target.valueAsNumber} : s))} className="block w-24 rounded border border-gray-600 bg-gray-900 p-2"/></label>
          <label className="min-w-0 flex-1 text-sm text-gray-200">Template identifier<input value={step.template_key} maxLength={100} onChange={e => change(key, steps.map((s, n) => n === i ? {...s, template_key: e.target.value} : s))} className="block w-full rounded border border-gray-600 bg-gray-900 p-2"/></label>
          <button type="button" onClick={() => change(key, steps.filter((_, n) => n !== i))} className="min-h-11 rounded border border-gray-600 px-3 text-sm text-gray-200">Remove</button>
        </div>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={steps.length >= 12 || (steps[steps.length - 1]?.delay_days ?? -1) >= 365} onClick={() => change(key, [...steps, {delay_days: (steps[steps.length - 1]?.delay_days ?? -1) + 1, template_key: ''}])} className="min-h-11 rounded border border-gray-600 px-3 text-sm text-white disabled:opacity-50">Add step</button>
          <button type="button" onClick={() => void save(key)} className="min-h-11 rounded bg-cyan-700 px-3 text-sm font-semibold text-white">Save draft</button>
        </div>
      </fieldset>;
    })}
  </section>;
}
