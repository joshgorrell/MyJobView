import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { notify } from '../../lib/feedback';

type Session = {
  id: string;
  session_type: 'shop_time' | 'training';
  session_date: string;
  assigned_profile: { full_name: string } | null;
  time_entries: Array<{ id: string; status: string; total_hours: number; clock_out: string | null }>;
};

export function InternalTimeApprovalQueue() {
  const { profile } = useAuth();
  const canReview = profile?.role === 'admin';
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!canReview || !profile?.organization_id) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from('internal_time_sessions')
      .select('id, session_type, session_date, assigned_profile:profiles!assigned_to(full_name), time_entries(id, status, total_hours, clock_out)')
      .eq('organization_id', profile.organization_id)
      .order('session_date', { ascending: false })
      .limit(200);
    if (error) {
      setSessions([]);
      notify('Unable to load internal time approvals.', { theme: 'blue', tone: 'error' });
    } else {
      setSessions(((data || []) as unknown as Session[]).filter(session =>
        session.time_entries?.some(entry => entry.status === 'submitted' && entry.clock_out !== null)));
    }
    setLoading(false);
  }, [canReview, profile?.organization_id]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function approve(session: Session) {
    if (!canReview || busy) return;
    setBusy(session.id);
    try {
      // Use the existing server-side review operation, not a direct time_entries update.
      // It owns authorization and the session/time-entry state transition.
      const { error } = await supabase.rpc('review_internal_time', {
        p_session_id: session.id,
        p_action: 'approve_time',
        p_notes: null,
      });
      if (error) throw error;
      notify('Time approved.', { theme: 'blue', tone: 'success' });
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Approval failed.', { theme: 'blue', tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  if (!canReview) return null;
  return <section className="rounded-xl border border-subtle bg-surface p-4 space-y-3">
    <h3 className="font-semibold text-primary">Completed Shop & Training time</h3>
    <p className="text-sm text-secondary">Approve submitted completed time using the existing manager review process. Denial or correction of completed time requires a separate audited server-side operation and is not enabled here.</p>
    {loading ? <p className="text-sm text-secondary">Loading approvals…</p> :
      sessions.length === 0 ? <p className="text-sm text-secondary">No completed time awaiting approval.</p> :
      sessions.map(session => <div key={session.id} className="rounded-lg border border-subtle p-3 space-y-2">
        <p className="text-sm font-medium text-primary">{session.session_type === 'shop_time' ? 'Shop Time' : 'Training Time'} · {session.session_date}</p>
        <p className="text-sm text-secondary">Employee: {session.assigned_profile?.full_name || 'Unknown employee'}</p>
        {session.time_entries.filter(entry => entry.status === 'submitted' && entry.clock_out !== null).map(entry =>
          <p key={entry.id} className="text-sm text-secondary">{Number(entry.total_hours).toFixed(2)} hours submitted</p>)}
        <button type="button" disabled={busy !== null} onClick={() => void approve(session)}
          className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Approve completed time</button>
      </div>)}
  </section>;
}
