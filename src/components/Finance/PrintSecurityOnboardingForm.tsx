import React, { useEffect, useState } from 'react';
import { X, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SECURITY_INITIAL_TERMS } from '../../lib/securityOnboarding';

export default function PrintSecurityOnboardingForm({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [template, setTemplate] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [term, setTerm] = useState(36);
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in to print a form.');
      const { data: profile, error: profileError } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
      if (profileError || !profile) throw new Error('Your organization could not be loaded.');
      const [t, s] = await Promise.all([
        supabase.from('security_contract_templates').select('id,name,contract_terms').eq('organization_id', profile.organization_id).eq('is_active', true).order('name'),
        supabase.from('monitoring_services').select('id,name,monthly_price').eq('organization_id', profile.organization_id).eq('is_active', true).order('name'),
      ]);
      if (t.error || s.error) throw new Error('The printable form options could not be loaded.');
      setTemplates((t.data || []).filter(t => !t.contract_terms?.includes('[LEGAL REVIEW:')));
      setServices(s.data || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  })(); }, []);
  async function print(e: React.FormEvent) {
    e.preventDefault();
    const tab = window.open('', '_blank');
    if (!tab) { setError('Please allow popups to print this form.'); return; }
    tab.document.write('<p>Preparing printable onboarding form...</p>');
    setBusy(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in to print this form.');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-blank-contract-form`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: template, service_ids: selected, term_months: term, price_override: price || null }),
      });
      if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result?.error || 'The printable form could not be loaded.'); }
      tab.document.open(); tab.document.write(await response.text()); tab.document.close();
    } catch (e: any) { tab.close(); setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 security-onboarding-controls">
    <form onSubmit={print} role="dialog" aria-modal="true" aria-label="Print blank onboarding form" className="bg-white text-black rounded-xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Print Blank Onboarding Form</h2><button type="button" onClick={onClose} aria-label="Close print form"><X /></button></div>
      <p className="text-sm">The customer fills this out by hand. After they return it, choose Enter Completed Paper Form to enter their information online. Printing creates no customer or contract record.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {loading ? <p role="status">Loading form options...</p> : <>
        <label className="block">Agreement template<select aria-label="Agreement template" required value={template} onChange={e => setTemplate(e.target.value)} className="block w-full border rounded p-2"><option value="">Choose a template</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="block">Initial term<select aria-label="Initial term" value={term} onChange={e => setTerm(Number(e.target.value))} className="block w-full border rounded p-2">{SECURITY_INITIAL_TERMS.map(n => <option key={n} value={n}>{n} months</option>)}</select></label>
        <fieldset><legend>Monitoring services</legend>{services.map(s => <label key={s.id} className="flex gap-2 py-1"><input type="checkbox" checked={selected.includes(s.id)} onChange={e => setSelected(e.target.checked ? [...selected, s.id] : selected.filter(id => id !== s.id))} />{s.name} (${Number(s.monthly_price).toFixed(2)}/month)</label>)}</fieldset>
        <label className="block">Monthly price override (optional)<input aria-label="Monthly price override" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="block w-full border rounded p-2" /></label>
        <button type="submit" disabled={busy || !template || !selected.length} className="flex items-center gap-2 bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"><Printer className="w-4 h-4" />{busy ? 'Preparing...' : 'Print Blank Form'}</button>
      </>}
    </form>
  </div>;
}
