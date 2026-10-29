import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { gpsTrackingService } from '../../lib/gpsTracking';

type Session = {
  id: string;
  title: string;
  session_type: 'shop_time' | 'training';
  status: string;
  approved_by: string | null;
  approved_at: string | null;
};
type Activity = { id: string; internal_session_id: string | null; clock_in: string; clock_out: string | null; entry_type: string };
function duration(start: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(start)) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
async function evidence(stopping: boolean) {
  const attemptedAt = new Date().toISOString();
  const gps = await gpsTrackingService.captureLocationForClockEvent(stopping).catch(() => null);
  const prefix = stopping ? 'clock_out' : 'clock_in';
  return {
    [prefix + '_gps_attempted_at']: attemptedAt,
    [prefix + '_gps_capture_method']: gps?.method || 'failed',
    [prefix + '_latitude']: gps?.latitude ?? null,
    [prefix + '_longitude']: gps?.longitude ?? null,
    [prefix + '_gps_accuracy']: gps?.accuracy ?? null,
    [prefix + '_gps_captured_at']: gps?.captured_at ?? null,
    [prefix + '_gps_duration_ms']: gps?.duration_ms ?? null,
  };
}

/** Shared Time Clock controls for employees with or without a Daily Clock. */
export function InternalTimeTimer({ onChanged }: { onChanged?: () => void }) {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<Activity | null>(null);
  const [runningSession, setRunningSession] = useState<Session | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!profile?.organization_id) return;
    try {
      const [activities, assigned] = await Promise.all([
        supabase.from('time_entries').select('id,internal_session_id,clock_in,clock_out,entry_type')
          .eq('organization_id', profile.organization_id).eq('technician_id', profile.id)
          .is('clock_out', null).in('status', ['draft', 'submitted'])
          .order('clock_in', { ascending: false }).limit(1),
        supabase.from('internal_time_sessions').select('id,title,session_type,status,approved_by,approved_at')
          .eq('organization_id', profile.organization_id).eq('assigned_to', profile.id)
          .in('status', ['scheduled', 'in_progress']).order('created_at', { ascending: false }).limit(30),
      ]);
      if (activities.error) throw activities.error;
      if (assigned.error) throw assigned.error;
      const current = (activities.data || [])[0] as Activity | undefined;
      const rows = (assigned.data || []) as Session[];
      setActive(current || null);
      setSessions(rows);
      setRunningSession(current?.internal_session_id ? rows.find(s => s.id === current.internal_session_id) || null : null);
      setVerified(true);
      setError('');
    } catch (e: any) {
      setVerified(false);
      setError(e.message || 'Unable to verify your running time.');
    }
  }, [profile?.id, profile?.organization_id]);
  useEffect(() => {
    void load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => { if (navigator.onLine && !busy) void load(); }, 15000);
    const focus = () => { void load(); };
    window.addEventListener('focus', focus);
    if (!profile) return () => { clearInterval(tick); clearInterval(poll); window.removeEventListener('focus', focus); };
    const channel = supabase.channel('time-modal-internal-' + profile.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries', filter: 'technician_id=eq.' + profile.id }, focus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_time_sessions', filter: 'assigned_to=eq.' + profile.id }, focus).subscribe();
    return () => { clearInterval(tick); clearInterval(poll); window.removeEventListener('focus', focus); void supabase.removeChannel(channel); };
  }, [load, profile?.id]);
  async function start(type: Session['session_type'], sessionId = crypto.randomUUID()) {
    if (!profile || busy || !verified || active || !navigator.onLine) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('start_internal_time', {
        p_session_id: sessionId, p_session_type: type, p_reason: null, p_evidence: await evidence(false),
      });
      if (error) throw error;
      await load();
      onChanged?.();
    } catch (e: any) { setError(e.message || 'Could not start internal time.'); }
    finally { setBusy(false); }
  }
  async function stop() {
    if (!runningSession || !active || busy || !verified || !navigator.onLine) return;
    if (!window.confirm(`Verify clock-out: Stop ${runningSession.session_type === 'shop_time' ? 'Shop Time' : 'Training'} and submit the recorded time for manager review?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('stop_internal_time', {
        p_session_id: runningSession.id, p_notes: null, p_evidence: await evidence(true),
      });
      if (error) throw error;
      await load();
      onChanged?.();
    } catch (e: any) { setError(e.message || 'Could not stop internal time.'); }
    finally { setBusy(false); }
  }
  if (!profile?.organization_id) return null;
  const canStart = verified && !active && !busy && navigator.onLine;
  const approved = sessions.filter(s => !!s.approved_by && !!s.approved_at && s.status === 'scheduled');
  return <section className="rounded-xl border border-subtle bg-elevated p-3 space-y-3" aria-label="Shop Time and Training">
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-semibold text-primary">Shop Time &amp; Training</h3>
      <button type="button" onClick={() => void load()} disabled={busy} className="min-h-11 px-3 rounded-lg border border-subtle text-sm">Refresh</button>
    </div>
    {runningSession && active ? <div className="rounded-xl border border-green-300 bg-green-50 p-3 space-y-2">
      <p className="font-semibold text-green-900">{runningSession.session_type === 'shop_time' ? 'Shop Time' : 'Training'} · Running</p>
      <p className="text-sm text-green-900">{runningSession.title} · {duration(active.clock_in, now)} elapsed</p>
      <button type="button" disabled={busy || !verified || !navigator.onLine} onClick={() => void stop()} className="min-h-12 w-full rounded-xl bg-red-600 text-white font-semibold disabled:opacity-50">Stop &amp; Verify Time</button>
    </div> : active ? <p className="text-sm text-amber-700">Another job or activity is running. Stop it before starting Shop Time or Training.</p> : null}
    {!active && <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={!canStart} onClick={() => void start('shop_time')} className="min-h-12 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50">Start Shop Time</button>
      <button type="button" disabled={!canStart} onClick={() => void start('training')} className="min-h-12 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50">Start Training</button>
    </div>}
    {!active && approved.length > 0 && <div className="space-y-2">
      <p className="text-sm font-semibold">Approved sessions</p>
      {approved.map(session => <button key={session.id} type="button" disabled={!canStart}
        onClick={() => void start(session.session_type, session.id)}
        className="min-h-11 w-full rounded-lg border border-subtle p-2 text-left text-sm disabled:opacity-50">
        Start {session.session_type === 'shop_time' ? 'Shop Time' : 'Training'} · {session.title}
      </button>)}
    </div>}
    {!navigator.onLine && <p className="text-sm text-amber-700">Reconnect to start or stop internal time.</p>}
    {!!error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <p className="text-xs text-secondary">Shop and Training time is separate from customer jobs and is submitted for manager review. Daily Clock employees remain on their workday clock.</p>
  </section>;
}
