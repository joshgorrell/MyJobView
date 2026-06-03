import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Wrench, BookOpen, Clock, Play, StopCircle, CheckCircle,
  Calendar, AlertCircle, Plus, XCircle, XOctagon
} from 'lucide-react';
import { RequestInternalTimeModal } from '../Technician/RequestInternalTimeModal';

interface InternalSession {
  id: string;
  session_type: 'shop_time' | 'training';
  title: string;
  description: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'pending_approval' | 'denied';
  updated_at?: string;
  predetermined_hours: number | null;
  requested_by: string | null;
  request_reason: string | null;
  denial_reason: string | null;
}

interface CompanySettings {
  id: string;
  shop_time_request_enabled: boolean;
  training_time_request_enabled: boolean;
  time_request_requires_approval: boolean;
}

interface ActiveEntry {
  id: string;
  session_id: string;
  clock_in: string;
}

function formatTime12(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(d: string) {
  const parts = d.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

function getElapsed(clockIn: string): string {
  const diffMs = Date.now() - new Date(clockIn).getTime();
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface AssignedSessionsWidgetProps {
  onRefreshParent?: () => void;
}

export function AssignedSessionsWidget({ onRefreshParent }: AssignedSessionsWidgetProps) {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<InternalSession[]>([]);
  const [activeEntries, setActiveEntries] = useState<ActiveEntry[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockingIn, setClockingIn] = useState<string | null>(null);
  const [clockingOut, setClockinOut] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [now, setNow] = useState(new Date());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showNotesFor, setShowNotesFor] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      loadSessions();
      loadCompanySettings();
    }
  }, [profile]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  async function loadCompanySettings() {
    const { data } = await supabase
      .from('company_settings')
      .select('id, shop_time_request_enabled, training_time_request_enabled, time_request_requires_approval')
      .maybeSingle();
    setCompanySettings(data as CompanySettings | null);
  }

  async function loadSessions() {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const twoDaysAhead = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: sessionData } = await supabase
        .from('internal_time_sessions')
        .select(`
          id, session_type, title, description, session_date, start_time, end_time,
          status, predetermined_hours, requested_by, request_reason, denial_reason, updated_at
        `)
        .eq('assigned_to', profile!.id)
        .in('status', ['scheduled', 'in_progress', 'pending_approval', 'denied'])
        .gte('session_date', twoDaysAgo)
        .lte('session_date', twoDaysAhead)
        .order('session_date')
        .order('start_time', { nullsFirst: true });

      const { data: entryData } = await supabase
        .from('time_entries')
        .select('id, internal_session_id, clock_in')
        .eq('technician_id', profile!.id)
        .is('clock_out', null)
        .in('entry_type', ['shop_time', 'training']);

      setSessions((sessionData as InternalSession[]) || []);
      setActiveEntries(
        (entryData || []).filter((e: any) => e.internal_session_id).map((e: any) => ({
          id: e.id,
          session_id: e.internal_session_id,
          clock_in: e.clock_in,
        }))
      );
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function clockInToSession(session: InternalSession) {
    setClockingIn(session.id);
    try {
      const now = new Date();
      const { data: companyData } = await supabase
        .from('company_settings')
        .select('id')
        .maybeSingle();

      const { error } = await supabase.from('time_entries').insert({
        company_id: companyData?.id,
        technician_id: profile!.id,
        entry_date: now.toISOString().split('T')[0],
        clock_in: now.toISOString(),
        clock_out: null,
        total_hours: 0,
        break_minutes: 0,
        status: 'draft',
        entry_type: session.session_type,
        internal_session_id: session.id,
        notes: null,
      });

      if (error) throw error;

      await supabase
        .from('internal_time_sessions')
        .update({ status: 'in_progress' })
        .eq('id', session.id);

      loadSessions();
      onRefreshParent?.();
    } catch (err: any) {
      console.error('Error clocking in:', err);
      alert(err.message || 'Failed to clock in');
    } finally {
      setClockingIn(null);
    }
  }

  async function clockOutOfSession(session: InternalSession) {
    const entry = activeEntries.find(e => e.session_id === session.id);
    if (!entry) return;

    setClockinOut(session.id);
    try {
      const clockOutTime = new Date();
      const diffMs = clockOutTime.getTime() - new Date(entry.clock_in).getTime();
      const totalHours = Math.max(0, diffMs / 3600000);

      const { error } = await supabase
        .from('time_entries')
        .update({
          clock_out: clockOutTime.toISOString(),
          total_hours: parseFloat(totalHours.toFixed(4)),
          status: 'submitted',
          notes: notes[session.id] || null,
        })
        .eq('id', entry.id);

      if (error) throw error;

      await supabase
        .from('internal_time_sessions')
        .update({ status: 'completed' })
        .eq('id', session.id);

      setShowNotesFor(null);
      setNotes(prev => {
        const next = { ...prev };
        delete next[session.id];
        return next;
      });

      loadSessions();
      onRefreshParent?.();
    } catch (err: any) {
      console.error('Error clocking out:', err);
      alert(err.message || 'Failed to clock out');
    } finally {
      setClockinOut(null);
    }
  }

  async function cancelPendingRequest(session: InternalSession) {
    setCancellingId(session.id);
    try {
      const { error } = await supabase
        .from('internal_time_sessions')
        .update({ status: 'cancelled' })
        .eq('id', session.id)
        .eq('assigned_to', profile!.id)
        .eq('requested_by', profile!.id)
        .eq('status', 'pending_approval');

      if (error) throw error;
      loadSessions();
    } catch (err: any) {
      console.error('Error cancelling request:', err);
      alert(err.message || 'Failed to cancel request');
    } finally {
      setCancellingId(null);
    }
  }

  const requestEnabled =
    companySettings?.shop_time_request_enabled ||
    companySettings?.training_time_request_enabled;

  const pendingSessions = sessions.filter(s => s.status === 'pending_approval');
  const deniedSessions = sessions.filter(s => s.status === 'denied');
  const activeSessions = sessions.filter(s => s.status !== 'pending_approval' && s.status !== 'denied');

  const showWidget = !loading && (sessions.length > 0 || deniedSessions.length > 0 || requestEnabled);
  if (!showWidget) return null;

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-600" />
            <h2 className="text-base sm:text-lg font-bold text-gray-900">Assigned Sessions</h2>
            {sessions.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
                {sessions.length}
              </span>
            )}
          </div>

          {requestEnabled && companySettings && (
            <button
              onClick={() => setShowRequestModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Request Time
            </button>
          )}
        </div>

        {/* Pending Approval Requests */}
        {pendingSessions.length > 0 && (
          <div className="mb-3 space-y-2">
            {pendingSessions.map(session => (
              <div
                key={session.id}
                className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/60 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
                      {session.session_type === 'shop_time'
                        ? <Wrench className="w-3.5 h-3.5 text-amber-600" />
                        : <BookOpen className="w-3.5 h-3.5 text-teal-600" />
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{session.title}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-200 text-amber-800 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Awaiting Approval
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {session.session_date === new Date().toISOString().split('T')[0] ? 'Today' : formatDate(session.session_date)}
                        </span>
                        {session.predetermined_hours && (
                          <span className="flex items-center gap-1 text-blue-700">
                            <Clock className="w-3 h-3" />
                            {session.predetermined_hours}h requested
                          </span>
                        )}
                      </div>
                      {session.request_reason && (
                        <p className="text-xs text-gray-600 mt-1 italic">"{session.request_reason}"</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => cancelPendingRequest(session)}
                    disabled={cancellingId === session.id}
                    title="Cancel request"
                    className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 rounded-lg text-xs transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {cancellingId === session.id ? '...' : 'Cancel'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Denied Requests */}
        {deniedSessions.length > 0 && (
          <div className="mb-3 space-y-2">
            {deniedSessions.map(session => (
              <div
                key={session.id}
                className="rounded-lg border-2 border-red-300 bg-red-50 p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center mt-0.5">
                    <XOctagon className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{session.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-200 text-red-800 flex items-center gap-1">
                        <XOctagon className="w-3 h-3" />
                        Request Denied
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {session.session_date === new Date().toISOString().split('T')[0] ? 'Today' : formatDate(session.session_date)}
                      </span>
                      {session.predetermined_hours && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {session.predetermined_hours}h requested
                        </span>
                      )}
                    </div>
                    {session.denial_reason ? (
                      <div className="mt-2 flex items-start gap-2 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-red-800">Manager&apos;s reason:</p>
                          <p className="text-xs text-red-700 mt-0.5">"{session.denial_reason}"</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-red-600 mt-1.5 italic">No reason provided by manager.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state when no active sessions but request button is shown */}
        {activeSessions.length === 0 && pendingSessions.length === 0 && deniedSessions.length === 0 && requestEnabled && (
          <div className="text-center py-6 text-gray-400">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No sessions scheduled</p>
            <p className="text-xs mt-0.5">Use "Request Time" to ask for shop time or training</p>
          </div>
        )}

        {/* Active / Scheduled Sessions */}
        {activeSessions.length > 0 && (
          <div className="space-y-3">
            {activeSessions.map(session => {
              const activeEntry = activeEntries.find(e => e.session_id === session.id);
              const isActive = !!activeEntry;
              const isToday = session.session_date === new Date().toISOString().split('T')[0];
              const isShowingNotes = showNotesFor === session.id;

              return (
                <div
                  key={session.id}
                  className={`rounded-lg border-2 overflow-hidden transition-all ${
                    isActive
                      ? 'border-green-400 bg-green-50'
                      : session.session_type === 'shop_time'
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-teal-400 bg-teal-50'
                  }`}
                >
                  <div className="p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5 ${
                          isActive
                            ? 'bg-green-200'
                            : session.session_type === 'shop_time'
                              ? 'bg-amber-200'
                              : 'bg-teal-200'
                        }`}>
                          {session.session_type === 'shop_time'
                            ? <Wrench className={`w-4 h-4 ${isActive ? 'text-green-700' : 'text-amber-700'}`} />
                            : <BookOpen className={`w-4 h-4 ${isActive ? 'text-green-700' : 'text-teal-700'}`} />
                          }
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm sm:text-base">{session.title}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              session.session_type === 'shop_time'
                                ? 'bg-amber-200 text-amber-800'
                                : 'bg-teal-200 text-teal-800'
                            }`}>
                              {session.session_type === 'shop_time' ? 'Shop Time' : 'Training'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-600 flex-wrap">
                            <span className={`flex items-center gap-1 ${isToday ? 'text-blue-700 font-semibold' : ''}`}>
                              <Calendar className="w-3 h-3" />
                              {isToday ? 'Today' : formatDate(session.session_date)}
                            </span>
                            {session.start_time && !session.predetermined_hours && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime12(session.start_time)}
                                {session.end_time && ` – ${formatTime12(session.end_time)}`}
                              </span>
                            )}
                            {session.predetermined_hours && (
                              <span className="flex items-center gap-1 text-blue-700">
                                <Clock className="w-3 h-3" />
                                {session.predetermined_hours}h scheduled
                              </span>
                            )}
                            {isActive && activeEntry && (
                              <span className="flex items-center gap-1 text-green-700 font-semibold">
                                <Clock className="w-3 h-3" />
                                {getElapsed(activeEntry.clock_in)} elapsed
                              </span>
                            )}
                          </div>
                          {session.description && (
                            <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{session.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        {session.predetermined_hours ? (
                          <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-100 px-3 py-2 rounded-lg font-medium">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Admin-managed
                          </div>
                        ) : isActive ? (
                          <button
                            onClick={() => setShowNotesFor(isShowingNotes ? null : session.id)}
                            disabled={clockingOut === session.id}
                            className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            <StopCircle className="w-4 h-4" />
                            Clock Out
                          </button>
                        ) : (
                          <button
                            onClick={() => clockInToSession(session)}
                            disabled={clockingIn === session.id || activeEntries.length > 0}
                            title={activeEntries.length > 0 ? 'Already clocked into a session' : ''}
                            className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Play className="w-4 h-4" />
                            {clockingIn === session.id ? 'Starting...' : 'Clock In'}
                          </button>
                        )}
                      </div>
                    </div>

                    {isShowingNotes && isActive && (
                      <div className="mt-3 pt-3 border-t border-green-200">
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                          Notes (optional)
                        </label>
                        <textarea
                          value={notes[session.id] || ''}
                          onChange={(e) => setNotes(prev => ({ ...prev, [session.id]: e.target.value }))}
                          rows={2}
                          placeholder="What did you work on? (not required)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none bg-white"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => setShowNotesFor(null)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => clockOutOfSession(session)}
                            disabled={clockingOut === session.id}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            {clockingOut === session.id ? 'Saving...' : 'Confirm Clock Out'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showRequestModal && companySettings && (
        <RequestInternalTimeModal
          companySettings={companySettings}
          onClose={() => setShowRequestModal(false)}
          onSubmitted={() => {
            setShowRequestModal(false);
            loadSessions();
          }}
        />
      )}
    </>
  );
}
