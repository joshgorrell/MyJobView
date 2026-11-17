import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type SmsSettings = {
  organization_id: string;
  enabled: boolean;
  on_my_way_enabled: boolean;
  appointment_reminders_enabled: boolean;
  review_requests_enabled: boolean;
  proposal_notifications_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
};
const features: { key: keyof SmsSettings; title: string; description: string }[] = [
  { key: 'on_my_way_enabled', title: 'Technician on the way', description: 'Notify customers when their technician is heading over.' },
  { key: 'appointment_reminders_enabled', title: 'Appointment reminders', description: 'Send scheduled appointment reminders.' },
  { key: 'review_requests_enabled', title: 'Review requests', description: 'Invite customers to share feedback after service.' },
  { key: 'proposal_notifications_enabled', title: 'Proposal updates', description: 'Notify customers about new proposals and follow-ups.' },
];
const defaults = (organization_id: string): SmsSettings => ({
  organization_id, enabled: false, on_my_way_enabled: false,
  appointment_reminders_enabled: false, review_requests_enabled: false,
  proposal_notifications_enabled: false, quiet_hours_start: '20:00',
  quiet_hours_end: '08:00', timezone: 'America/Chicago',
});

export function TextMessagingSettings() {
  const { profile } = useAuth();
  const org = profile?.organization_id;
  const canEdit = profile?.role === 'admin' || profile?.role === 'manager';
  const [settings, setSettings] = useState<SmsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError(''); setSettings(null);
      if (!org) { setError('Your dealer organization could not be identified.'); setLoading(false); return; }
      const result = await supabase.from('sms_automation_settings').select(
        'organization_id,enabled,on_my_way_enabled,appointment_reminders_enabled,review_requests_enabled,proposal_notifications_enabled,quiet_hours_start,quiet_hours_end,timezone'
      ).eq('organization_id', org).maybeSingle();
      if (!active) return;
      if (result.error) setError(result.error.message);
      else setSettings(result.data ?? defaults(org));
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [org]);
  async function save() {
    if (!settings || !canEdit || !org || saving) return;
    setSaving(true); setError(''); setMessage('');
    const payload = { ...settings, organization_id: org, updated_at: new Date().toISOString() };
    const { error: saveError } = await supabase.from('sms_automation_settings')
      .upsert(payload, { onConflict: 'organization_id' });
    if (saveError) setError(saveError.message);
    else setMessage('Messaging preferences saved. Delivery still requires an activated and tested Twilio worker.');
    setSaving(false);
  }
  if (loading) return <div className="p-6 text-gray-500">Loading text messaging settings…</div>;
  if (!settings) return <div className="p-6 text-red-600">{error || 'Messaging settings unavailable.'}</div>;
  const toggle = (key: keyof SmsSettings) => setSettings(previous =>
    previous ? { ...previous, [key]: !previous[key] } : previous);
  return <div className="max-w-3xl space-y-6">
    <div>
      <h2 className="text-xl font-semibold text-gray-900">Text Messaging</h2>
      <p className="mt-1 text-sm text-gray-600">Choose which customer notifications your dealership may send through Twilio.</p>
      <p className="mt-2 text-sm text-amber-700">Configuration only: enabling a switch does not activate the delivery worker. Customer opt-in is required.</p>
    </div>
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <label className="flex items-center justify-between gap-4">
        <span><span className="block font-semibold">Enable customer text messaging</span>
          <span className="block text-sm text-gray-500">Master switch for all automated customer texts.</span></span>
        <input type="checkbox" className="h-5 w-5" checked={settings.enabled} disabled={!canEdit}
          onChange={() => toggle('enabled')} />
      </label>
    </div>
    <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
      {features.map(feature => <label key={feature.key} className="flex items-center justify-between gap-4 p-5">
        <span><span className="block font-medium">{feature.title}</span>
          <span className="block text-sm text-gray-500">{feature.description}</span></span>
        <input type="checkbox" className="h-5 w-5" checked={Boolean(settings[feature.key])}
          disabled={!canEdit} onChange={() => toggle(feature.key)} />
      </label>)}
    </div>
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <h3 className="font-semibold">Quiet hours</h3>
      <p className="text-sm text-gray-500">Messages wait outside the configured hours. Times use your selected timezone.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="text-sm">Start
          <input type="time" className="mt-1 w-full rounded border p-2" disabled={!canEdit}
            value={settings.quiet_hours_start.slice(0, 5)}
            onChange={e => setSettings({ ...settings, quiet_hours_start: e.target.value })} />
        </label>
        <label className="text-sm">End
          <input type="time" className="mt-1 w-full rounded border p-2" disabled={!canEdit}
            value={settings.quiet_hours_end.slice(0, 5)}
            onChange={e => setSettings({ ...settings, quiet_hours_end: e.target.value })} />
        </label>
        <label className="text-sm">Timezone
          <select className="mt-1 w-full rounded border p-2" disabled={!canEdit}
            value={settings.timezone} onChange={e => setSettings({ ...settings, timezone: e.target.value })}>
            {['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'].map(zone =>
              <option key={zone} value={zone}>{zone}</option>)}
          </select>
        </label>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {canEdit && <button type="button" onClick={() => void save()} disabled={saving}
      className="rounded-lg bg-blue-600 px-5 py-2.5 text-white disabled:opacity-50">
      {saving ? 'Saving…' : 'Save messaging settings'}
    </button>}
  </div>;
}
