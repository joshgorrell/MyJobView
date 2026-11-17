import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type Category = 'appointment_reminder' | 'review_request' | 'proposal_notification';
const templates: { category: Category; label: string; example: string }[] = [
  { category: 'appointment_reminder', label: 'Appointment reminder', example: 'Hello! This is a reminder of your upcoming appointment. Reply to our office if you need assistance.' },
  { category: 'review_request', label: 'Review request', example: 'Thank you for choosing us! We would appreciate your feedback about your experience.' },
  { category: 'proposal_notification', label: 'Proposal notification', example: 'Your proposal is ready for review. Please contact us if you have any questions.' },
];
const allowedTokens: Record<Category, readonly string[]> = {
  appointment_reminder: ['customer_name', 'appointment_date', 'appointment_time', 'company_name'],
  review_request: ['customer_name', 'company_name', 'review_link'],
  proposal_notification: ['customer_name', 'company_name', 'proposal_link'],
};
const sampleValues: Record<string, string> = {
  customer_name: 'Alex', appointment_date: 'December 3',
  appointment_time: '2:00 PM', company_name: 'Example Dealer',
  review_link: 'https://example.com/review',
  proposal_link: 'https://example.com/proposal',
};
function unknownTokens(body: string, category: Category): string[] {
  const found = Array.from(body.matchAll(/\\{([^{}]+)\\}/g), match => match[1]);
  return Array.from(new Set(found.filter(token => !allowedTokens[category].includes(token))));
}
function preview(body: string, category: Category): string {
  return body.replace(/\\{([^{}]+)\\}/g, (full, token: string) =>
    allowedTokens[category].includes(token) ? sampleValues[token] : full);
}
export function SmsTemplateDrafts() {
  const { profile } = useAuth();
  const org = profile?.organization_id;
  const canEdit = profile?.role === 'admin' || profile?.role === 'manager';
  const [drafts, setDrafts] = useState<Record<Category, string>>({
    appointment_reminder: templates[0].example,
    review_request: templates[1].example,
    proposal_notification: templates[2].example,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Category | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setMessage('');
    if (!org) { setError('Dealer organization unavailable.'); setLoading(false); return; }
    void supabase.from('sms_message_templates').select('category,body').eq('organization_id', org)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setDrafts(previous => {
          const next = { ...previous };
          for (const item of data ?? []) {
            if (item.category in next) next[item.category as Category] = item.body;
          }
          return next;
        });
        setLoading(false);
      });
    return () => { active = false; };
  }, [org]);
  async function save(category: Category) {
    if (!canEdit || !org || saving) return;
    const body = drafts[category].trim();
    if (!body || body.length > 1600) { setError('Template must contain 1–1600 characters.'); return; }
    const invalid = unknownTokens(body, category);
    if (invalid.length) { setError(`Unsupported variables in ${category.replace(/_/g, ' ')}: ${invalid.join(', ')}`); return; }
    setSaving(category); setMessage(''); setError('');
    const { error: saveError } = await supabase.from('sms_message_templates')
      .upsert({ organization_id: org, category, body, updated_at: new Date().toISOString() },
        { onConflict: 'organization_id,category' });
    if (saveError) setError(saveError.message);
    else setMessage('Draft saved. Automated sends are not yet connected to these templates.');
    setSaving(null);
  }
  return <section className="space-y-4 border-t border-gray-200 pt-6">
    <div><h5 className="font-semibold">Additional message templates</h5>
      <p className="mt-1 text-sm text-amber-700">Drafts only. These templates are not yet connected to live SMS sending. Avoid adding customer-specific information.</p>
    </div>
    {loading ? <p className="text-sm text-gray-500">Loading templates…</p> : templates.map(item =>
      <div key={item.category} className="space-y-2 rounded-lg border border-gray-200 p-4">
        <label className="block text-sm font-medium" htmlFor={item.category}>{item.label}</label>
        <textarea id={item.category} rows={3} maxLength={1600} disabled={!canEdit}
          className="w-full rounded-lg border border-gray-300 p-3 text-sm"
          value={drafts[item.category]}
          onChange={event => setDrafts(previous => ({ ...previous, [item.category]: event.target.value }))} />
        <p className="text-xs text-gray-500">Available variables: {allowedTokens[item.category].map(token => `{${token}}`).join(', ')}</p>
        {unknownTokens(drafts[item.category], item.category).length > 0 &&
          <p className="text-xs text-red-600">Unsupported variables: {unknownTokens(drafts[item.category], item.category).join(', ')}</p>}
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="mb-1 text-xs font-semibold text-gray-600">Example preview — no message is sent</p>
          <p className="whitespace-pre-wrap break-words text-sm">{preview(drafts[item.category], item.category)}</p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">{drafts[item.category].length}/1600 characters</span>
          {canEdit && <button type="button" disabled={saving !== null || unknownTokens(drafts[item.category], item.category).length > 0} onClick={() => void save(item.category)}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">
            {saving === item.category ? 'Saving…' : 'Save draft'}
          </button>}
        </div>
      </div>)}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
  </section>;
}
