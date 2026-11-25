import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeWebsiteOrigin, websiteWidgetKinds, websiteWidgetEmbed, type WebsiteWidgetKind } from '../../lib/websiteWidgets';

const labels: Record<WebsiteWidgetKind, string> = {
  'sales-lead': 'Sales Leads', chat: 'Live Chat', service: 'Service Requests',
  feedback: 'Customer Feedback', portal: 'Customer Portal', analytics: 'Conversion Analytics',
};
type Settings = { kind: WebsiteWidgetKind; public_id: string; enabled: boolean; allowed_origins: string[]; branding: { name?: string; color?: string } };
function WidgetEditor({ kind, organizationId, initial }: { kind: WebsiteWidgetKind; organizationId: string; initial?: Settings }) {
  const [saved, setSaved] = useState(initial);
  const [origins, setOrigins] = useState(initial?.allowed_origins.join('\n') ?? '');
  const [name, setName] = useState(initial?.branding.name ?? '');
  const [color, setColor] = useState(initial?.branding.color ?? '#2563eb');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    setBusy(true); setMessage('');
    try {
      const allowed_origins = [...new Set(origins.split(/\s+/).filter(Boolean).map(normalizeWebsiteOrigin))];
      const { data, error } = await supabase.from('website_widget_settings').upsert({
        organization_id: organizationId, kind, allowed_origins, branding: { name: name.trim(), color }, enabled: false,
      }, { onConflict: 'organization_id,kind' }).select('kind,public_id,enabled,allowed_origins,branding').single();
      if (error) throw error;
      setSaved(data as Settings); setMessage('Configuration saved. Activation is not available yet.');
    } catch { setMessage('Unable to save. Check the HTTPS origins and try again.'); }
    finally { setBusy(false); }
  }
  return <section className="border rounded-lg p-4 space-y-3 min-w-0">
    <h4 className="font-semibold">{labels[kind]}</h4>
    <p className="text-sm">Disabled · Runtime pending</p>
    <label className="block text-sm">Approved website origins (one per line)
      <textarea className="block w-full border rounded p-2" value={origins} onChange={e => setOrigins(e.target.value)} placeholder="https://example.com" />
    </label>
    <label className="block text-sm">Display name<input className="block w-full border rounded p-2" value={name} onChange={e => setName(e.target.value)} maxLength={100} /></label>
    <label className="block text-sm">Brand color <input type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
    <div className="border rounded p-3" aria-label="Branding preview"><strong>{name || 'Your company'}</strong><div className="mt-2 inline-block rounded px-3 py-2 text-white" style={{ backgroundColor: color }}>{labels[kind]}</div></div>
    <button type="button" disabled={busy} onClick={() => void save()} className="border rounded px-3 py-2">Save configuration</button>
    {saved && <button type="button" className="border rounded px-3 py-2 ml-2" onClick={async () => {
      try { await navigator.clipboard.writeText(websiteWidgetEmbed(kind, saved.public_id, window.location.origin)); setMessage('Preview code copied. Do not install until runtime is released.'); }
      catch { setMessage('Unable to copy preview code.'); }
    }}>Copy preview code</button>}
    <p role="status" className="text-sm">{message}</p>
  </section>;
}
export function WebsiteWidgetSettings({ organizationId }: { organizationId: string }) {
  const [rows, setRows] = useState<Settings[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setRows(null); setError(false);
    void supabase.from('website_widget_settings').select('kind,public_id,enabled,allowed_origins,branding').eq('organization_id', organizationId).then(({ data, error }) => {
      if (!cancelled) { setError(!!error); if (!error) setRows(data as Settings[]); }
    });
    return () => { cancelled = true; };
  }, [organizationId]);
  if (error) return <p role="alert">Website widget settings are unavailable.</p>;
  if (!rows) return <p role="status">Loading website widgets…</p>;
  return <div className="space-y-4"><h3 className="text-lg font-semibold">Website Widgets</h3>
    <p className="text-sm">Configure each widget independently. Installation and activation are pending runtime release.</p>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{websiteWidgetKinds.map(kind => <WidgetEditor key={organizationId + kind} kind={kind} organizationId={organizationId} initial={rows.find(row => row.kind === kind)} />)}</div>
  </div>;
}
