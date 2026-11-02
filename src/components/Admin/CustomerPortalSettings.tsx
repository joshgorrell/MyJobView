import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const portalOptions = [
  {
    "label": "Security Contracts",
    "key": "portal_security_contracts_enabled",
    "defaultValue": true
  },
  {
    "label": "Proposals",
    "key": "portal_proposals_enabled",
    "defaultValue": true
  },
  {
    "label": "Tasks",
    "key": "portal_tasks_enabled",
    "defaultValue": true
  },
  {
    "label": "Sales Orders",
    "key": "portal_sales_orders_enabled",
    "defaultValue": true
  },
  {
    "label": "Projects",
    "key": "portal_projects_enabled",
    "defaultValue": false
  },
  {
    "label": "Appointments",
    "key": "portal_appointments_enabled",
    "defaultValue": false
  },
  {
    "label": "Invoices",
    "key": "portal_invoices_enabled",
    "defaultValue": false
  },
  {
    "label": "Messages",
    "key": "portal_messages_enabled",
    "defaultValue": false
  },
  {
    "label": "VIP Services",
    "key": "portal_vip_services_enabled",
    "defaultValue": false
  },
  {
    "label": "Public VIP Self-Signup",
    "key": "enable_public_vip_signup",
    "defaultValue": false
  }
] as const;
type PortalKey = typeof portalOptions[number]['key'];
type PortalValues = Record<PortalKey, boolean>;

export function CustomerPortalSettings() {
  const [recordId, setRecordId] = useState<string | null>(null);
  const [values, setValues] = useState<PortalValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const { data, error: loadError } = await supabase.from('company_settings').select('*').maybeSingle();
      if (loadError) throw loadError;
      if (!data?.id) throw new Error('Company settings could not be loaded. No changes have been made.');
      const next = {} as PortalValues;
      for (const option of portalOptions) next[option.key] = data[option.key] ?? option.defaultValue;
      setRecordId(data.id);
      setValues(next);
    } catch (cause) {
      setRecordId(null);
      setValues(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    if (!recordId || !values || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { error: saveError } = await supabase.from('company_settings')
        .update({ ...values, updated_at: new Date().toISOString() }).eq('id', recordId);
      if (saveError) throw saveError;
      setNotice('Customer Portal settings saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-primary">Customer Portal Settings</h2>
        <p className="text-sm text-muted mt-1">Choose which features customers can access. Changes only affect portal visibility and public VIP signup.</p>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-500 p-3 text-sm text-red-600">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-green-500 p-3 text-sm text-green-700">{notice}</div>}
      {loading ? <p className="text-muted">Loading portal settings…</p> : values ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {portalOptions.map(option => (
              <label key={option.key} className="flex items-center gap-3 rounded-xl border border-subtle bg-canvas p-4 text-primary">
                <input type="checkbox" checked={values[option.key]}
                  onChange={event => { setNotice(''); setValues(current => current ? { ...current, [option.key]: event.target.checked } : current); }}
                  className="h-5 w-5 rounded" />
                <span className="text-sm font-medium">{option.label}</span>
              </label>
            ))}
          </div>
          <button type="button" disabled={saving} onClick={() => void save()}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Portal Settings'}
          </button>
        </>
      ) : <button type="button" onClick={() => void load()} className="rounded-lg border border-subtle px-4 py-2 text-primary">Retry loading</button>}
    </div>
  );
}
