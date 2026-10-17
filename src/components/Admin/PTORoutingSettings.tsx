import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { canManageTimeOff } from '../../lib/timeOff';
import { useToast } from '../Shared/Toast';
interface Person { id: string; full_name: string; role: string }
export function PTORoutingSettings() {
  const { profile } = useAuth();
  const toast = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [approvers, setApprovers] = useState<string[]>([]);
  const [notify, setNotify] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (profile?.role !== 'admin') return;
    let active = true;
    Promise.all([
      supabase.from('profiles').select('id,full_name,role').eq('organization_id', profile.organization_id).eq('is_active', true).order('full_name'),
      supabase.from('pto_routing_settings').select('approver_ids,notification_ids').eq('organization_id', profile.organization_id).maybeSingle(),
    ]).then(([users, config]) => {
      if (!active) return;
      if (users.error || config.error) { setError('PTO routing could not be loaded. Apply the PTO migration and retry.'); return; }
      const rows = users.data || [];
      setPeople(rows);
      setApprovers(config.data?.approver_ids || rows.filter(p => canManageTimeOff(p.role)).map(p => p.id));
      setNotify(config.data?.notification_ids || rows.filter(p => canManageTimeOff(p.role)).map(p => p.id));
      setReady(true);
    }).catch(() => { if (active) setError('PTO routing could not be loaded.'); });
    return () => { active = false; };
  }, [profile?.id]);
  if (profile?.role !== 'admin') return null;
  function toggle(values: string[], id: string) { return values.includes(id) ? values.filter(v => v !== id) : [...values, id]; }
  async function save() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('save_pto_routing', { p_approvers: approvers, p_notify: notify });
      if (error) throw error;
      toast.success('PTO approvers and notification recipients saved');
    } catch (e: any) { toast.error(e.message || 'Unable to save PTO routing'); }
    finally { setBusy(false); }
  }
  return <details className="rounded-xl border border-subtle bg-surface p-4"><summary className="min-h-11 cursor-pointer font-semibold">PTO Approvers & Notifications</summary><p className="text-sm text-secondary my-3">Select managers who can approve requests and users who receive in-app updates. Administrators retain approval access. Employees receive updates to their own requests.</p>{error && <p role="alert" className="text-red-600">{error}</p>}{ready && <><div className="space-y-2">{people.map(person => <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle py-2"><span className="text-sm font-medium">{person.full_name}</span><div className="flex gap-4">{canManageTimeOff(person.role) && <label className="flex items-center gap-2 text-sm min-h-11"><input type="checkbox" checked={person.role === 'admin' || approvers.includes(person.id)} disabled={person.role === 'admin'} onChange={() => setApprovers(toggle(approvers, person.id))} />Approve</label>}<label className="flex items-center gap-2 text-sm min-h-11"><input type="checkbox" checked={notify.includes(person.id)} onChange={() => setNotify(toggle(notify, person.id))} />Notify</label></div></div>)}</div><button onClick={save} disabled={busy} className="min-h-11 mt-4 rounded-lg bg-blue-600 text-white px-4 disabled:opacity-50">{busy ? 'Saving…' : 'Save PTO Routing'}</button></>}</details>;
}
