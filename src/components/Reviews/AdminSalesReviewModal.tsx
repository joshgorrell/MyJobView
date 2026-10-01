import React, { useEffect, useRef, useState } from 'react';
import { lostReviewAction } from './lostReview';
import { adminLossReasons, adminRatingFields } from '../../../supabase/functions/lost-opportunity-review/adminReview';

type Rep = { id: string; first_name: string; last_name: string; is_active: boolean };
type Assessment = {
  sales_rep_id: string | null; primary_reason: string; contributing_reasons: string[];
  preventability: string; strengths: string; improvements: string; findings: string;
  discovery_rating: number | null; attention_rating: number | null; explanation_rating: number | null;
  communication_rating: number | null; value_rating: number | null;
  updated_at?: string; updated_by?: string;
};
const empty: Assessment = { sales_rep_id: null, primary_reason: 'unknown', contributing_reasons: [],
  preventability: 'unknown', strengths: '', improvements: '', findings: '',
  discovery_rating: null, attention_rating: null, explanation_rating: null, communication_rating: null, value_rating: null };
const field = 'mt-1 w-full rounded-lg border border-gray-600 bg-gray-900 p-2 text-white';
export default function AdminSalesReviewModal({ requestId, customer, onClose }: {
  requestId: string; customer: string; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Assessment>(empty);
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    lostReviewAction({ action: 'assessment_load', request_id: requestId }).then(data => {
      if (!active) return;
      setReps(data.reps || []);
      setForm(data.assessment || { ...empty, sales_rep_id: data.default_rep_id });
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestId]);
  function change(patch: Partial<Assessment>) { setForm(current => ({ ...current, ...patch })); setSaved(false); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const data = await lostReviewAction({ action: 'assessment_save', request_id: requestId,
        assessment: form, expected_updated_at: form.updated_at || null });
      setForm(data.assessment); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save admin review.'); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} aria-labelledby="admin-review-title"
    onCancel={e => { e.preventDefault(); if (!saving) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-gray-600 bg-gray-800 p-5 text-gray-200 backdrop:bg-black/70">
    <div className="flex justify-between gap-4">
      <div><h2 id="admin-review-title" className="text-xl font-bold text-white">Admin Review</h2>
        <p className="text-lg text-cyan-200">{customer}</p></div>
      <button type="button" disabled={saving} onClick={onClose} className="self-start text-cyan-200">Close</button>
    </div>
    <p className="my-3 text-sm text-gray-400">Internal sales assessment. Rate performance independently of price. Customer feedback stays separate.</p>
    {error && <p role="alert" className="my-3 text-red-300">{error}</p>}
    {loading ? <p>Loading admin review…</p> : <form onSubmit={save} className="space-y-4">
      <fieldset disabled={saving || !!error && reps.length === 0} className="space-y-4">
        <label className="block">Sales rep<select value={form.sales_rep_id || ''} onChange={e => change({ sales_rep_id: e.target.value || null })} className={field}>
          <option value="">Unassigned / not enough information</option>
          {reps.map(rep => <option key={rep.id} value={rep.id}>{[rep.first_name, rep.last_name].filter(Boolean).join(' ') || 'Unnamed employee'}{rep.is_active ? '' : ' (inactive)'}</option>)}
        </select><span className="text-xs text-gray-400">Defaults to the linked proposal’s creator; correct it if someone else handled the sale.</span></label>
        <label className="block">Primary reason we lost the job<select value={form.primary_reason} onChange={e => change({ primary_reason: e.target.value })} className={field}>
          {adminLossReasons.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <fieldset className="space-y-2"><legend className="mb-2 font-semibold">Contributing reasons (choose all that apply)</legend>
          {adminLossReasons.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.contributing_reasons.includes(key)} onChange={e => change({ contributing_reasons: e.target.checked ? [...form.contributing_reasons, key] : form.contributing_reasons.filter(r => r !== key) })} />{label}
          </label>)}
        </fieldset>
        <fieldset className="space-y-3"><legend className="font-semibold">Sales performance</legend>
          <p className="text-sm text-gray-400">1 = Poor · 2 = Needs improvement · 3 = Meets expectations · 4 = Good · 5 = Excellent</p>
          {adminRatingFields.map(([key, label]) => <label key={key} className="block">{label}<select value={form[key] ?? ''} onChange={e => change({ [key]: e.target.value ? Number(e.target.value) : null })} className={field}>
            <option value="">N/A / not enough information</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
          </select></label>)}
        </fieldset>
        <label className="block">Was this loss preventable?<select value={form.preventability} onChange={e => change({ preventability: e.target.value })} className={field}>
          <option value="unknown">Not enough information</option><option value="yes">Yes</option><option value="possibly">Possibly</option><option value="no">No</option>
        </select></label>
        {([['strengths', 'What went well'], ['improvements', 'What should improve'], ['findings', 'Follow-up findings / coaching notes']] as const).map(([key, label]) =>
          <label key={key} className="block">{label}<textarea rows={3} maxLength={10000} value={form[key]} onChange={e => change({ [key]: e.target.value })} className={field} /></label>)}
        <button disabled={saving} className="rounded-lg bg-cyan-700 px-4 py-2 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save Admin Review'}</button>
      </fieldset>
      {saved && <p role="status" className="text-green-300">Admin review saved.</p>}
      {form.updated_at && <p className="text-xs text-gray-400">Last saved {new Date(form.updated_at).toLocaleString()}</p>}
    </form>}
  </dialog>;
}
