import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CreateInternalSessionModal } from './CreateInternalSessionModal';
import { Plus, Wrench, BookOpen, CheckCircle, XCircle, Clock, Calendar, ChevronDown, ChevronUp, User, AlertCircle, Filter, Trash2, CreditCard as Edit2, PlayCircle, Check, MessageSquare, ThumbsUp, ThumbsDown } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface InternalSession {
  id: string;
  session_type: 'shop_time' | 'training';
  title: string;
  description: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  assigned_to: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'pending_approval' | 'denied';
  predetermined_hours: number | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  requested_by: string | null;
  request_reason: string | null;
  denial_reason: string | null;
  created_at: string;
  assigned_profile: { full_name: string } | null;
  approver_profile: { full_name: string } | null;
  requester_profile: { full_name: string } | null;
  time_entries: Array<{
    id: string;
    total_hours: number;
    status: string;
    clock_in: string;
    clock_out: string | null;
  }>;
}

function formatDate(d: string) {
  const parts = d.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}

function formatTime12(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-200' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  pending_approval: { label: 'Pending Approval', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  denied: { label: 'Denied', color: 'bg-red-100 text-red-700 border-red-200' },
};

export function InternalSessionsManagement() {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<InternalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSession, setEditingSession] = useState<InternalSession | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<InternalSession | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReasonInput, setDenyReasonInput] = useState<Record<string, string>>({});
  const [showDenyFormFor, setShowDenyFormFor] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<'all' | 'shop_time' | 'training'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'pending_approval' | 'denied'>('all');
  const [dateFilter, setDateFilter] = useState<'upcoming' | 'today' | 'this_week' | 'all'>('upcoming');

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('internal_time_sessions')
        .select(`
          *,
          assigned_profile:profiles!assigned_to(full_name),
          approver_profile:profiles!approved_by(full_name),
          requester_profile:profiles!requested_by(full_name),
          time_entries(id, total_hours, status, clock_in, clock_out)
        `)
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setSessions((data as any[]) || []);
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const weekEnd = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    })();

    return sessions.filter(s => {
      if (typeFilter !== 'all' && s.session_type !== typeFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (dateFilter === 'today' && s.session_date !== today) return false;
      if (dateFilter === 'this_week' && (s.session_date < today || s.session_date > weekEnd)) return false;
      if (dateFilter === 'upcoming' && s.session_date < today && s.status === 'scheduled') return false;
      return true;
    });
  }, [sessions, typeFilter, statusFilter, dateFilter]);

  async function completeWithPredetermined(session: InternalSession) {
    if (!session.predetermined_hours) return;
    setApprovingId(session.id);
    try {
      const clockIn = new Date(`${session.session_date}T${session.start_time || '08:00'}:00`).toISOString();
      const clockOutDate = new Date(clockIn);
      clockOutDate.setTime(clockOutDate.getTime() + session.predetermined_hours * 3600 * 1000);

      const { data: companyData } = await supabase
        .from('company_settings')
        .select('id')
        .maybeSingle();

      const { error: entryError } = await supabase.from('time_entries').insert({
        company_id: companyData?.id,
        technician_id: session.assigned_to,
        entry_date: session.session_date,
        clock_in: clockIn,
        clock_out: clockOutDate.toISOString(),
        total_hours: session.predetermined_hours,
        break_minutes: 0,
        status: 'submitted',
        entry_type: session.session_type,
        internal_session_id: session.id,
        notes: session.description || null,
      });

      if (entryError) throw entryError;

      const { error: sessionError } = await supabase
        .from('internal_time_sessions')
        .update({ status: 'completed' })
        .eq('id', session.id);

      if (sessionError) throw sessionError;

      loadSessions();
    } catch (err: any) {
      console.error('Error completing session:', err);
      alert(err.message || 'Failed to complete session');
    } finally {
      setApprovingId(null);
    }
  }

  async function approveTimeEntry(session: InternalSession) {
    const entry = session.time_entries?.[0];
    if (!entry) return;
    setApprovingId(session.id);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({
          status: 'approved',
          approved_by: profile?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', entry.id);

      if (error) throw error;

      await supabase
        .from('internal_time_sessions')
        .update({ approved_by: profile?.id, approved_at: new Date().toISOString() })
        .eq('id', session.id);

      loadSessions();
    } catch (err: any) {
      console.error('Error approving entry:', err);
      alert(err.message || 'Failed to approve');
    } finally {
      setApprovingId(null);
    }
  }

  async function approveRequest(session: InternalSession) {
    setApprovingId(session.id);
    try {
      const today = new Date().toISOString().split('T')[0];
      const isToday = session.session_date === today;

      const newStatus = (isToday && !session.predetermined_hours) ? 'scheduled' : 'scheduled';

      const { error } = await supabase
        .from('internal_time_sessions')
        .update({
          status: newStatus,
          approved_by: profile?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', session.id);

      if (error) throw error;

      // Fire-and-forget: email the tech about the approval
      supabase.functions.invoke('send-time-request-notification', {
        body: { sessionId: session.id, direction: 'to_tech' },
      }).catch(() => {/* non-critical */});

      if (session.predetermined_hours && isToday) {
        const clockIn = new Date();
        const clockOut = new Date(clockIn.getTime() + session.predetermined_hours * 3600 * 1000);

        const { data: companyData } = await supabase
          .from('company_settings')
          .select('id')
          .maybeSingle();

        await supabase.from('time_entries').insert({
          company_id: companyData?.id,
          technician_id: session.assigned_to,
          entry_date: today,
          clock_in: clockIn.toISOString(),
          clock_out: clockOut.toISOString(),
          total_hours: session.predetermined_hours,
          break_minutes: 0,
          status: 'submitted',
          entry_type: session.session_type,
          internal_session_id: session.id,
          notes: session.request_reason || null,
        });

        await supabase
          .from('internal_time_sessions')
          .update({ status: 'completed' })
          .eq('id', session.id);
      }

      loadSessions();
    } catch (err: any) {
      console.error('Error approving request:', err);
      alert(err.message || 'Failed to approve request');
    } finally {
      setApprovingId(null);
    }
  }

  async function denyRequest(session: InternalSession) {
    const reason = denyReasonInput[session.id]?.trim();
    setDenyingId(session.id);
    try {
      const { error } = await supabase
        .from('internal_time_sessions')
        .update({
          status: 'denied',
          denial_reason: reason || null,
        })
        .eq('id', session.id);

      if (error) throw error;

      // Fire-and-forget: email the tech about the denial
      supabase.functions.invoke('send-time-request-notification', {
        body: { sessionId: session.id, direction: 'to_tech' },
      }).catch(() => {/* non-critical */});

      setShowDenyFormFor(null);
      setDenyReasonInput(prev => {
        const next = { ...prev };
        delete next[session.id];
        return next;
      });
      loadSessions();
    } catch (err: any) {
      console.error('Error denying request:', err);
      alert(err.message || 'Failed to deny request');
    } finally {
      setDenyingId(null);
    }
  }

  async function cancelSession(session: InternalSession) {
    try {
      const { error } = await supabase
        .from('internal_time_sessions')
        .update({ status: 'cancelled' })
        .eq('id', session.id);
      if (error) throw error;
      loadSessions();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel');
    }
  }

  async function deleteSession(session: InternalSession) {
    setDeletingId(session.id);
    try {
      const { error } = await supabase
        .from('internal_time_sessions')
        .delete()
        .eq('id', session.id);
      if (error) throw error;
      setSessions(prev => prev.filter(s => s.id !== session.id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  const pendingHourApproval = sessions.filter(s => {
    const entry = s.time_entries?.[0];
    return entry && entry.status === 'submitted';
  });

  const pendingRequestApproval = sessions.filter(s => s.status === 'pending_approval');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Loading sessions...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pending Tech Requests Banner */}
      {pendingRequestApproval.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-orange-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-orange-800">
                {pendingRequestApproval.length} employee time request{pendingRequestApproval.length > 1 ? 's' : ''} awaiting approval
              </span>
            </div>
            {statusFilter !== 'pending_approval' && (
              <button
                onClick={() => { setStatusFilter('pending_approval'); setDateFilter('all'); }}
                className="text-xs text-orange-700 font-medium underline underline-offset-2 hover:text-orange-900 transition-colors flex-shrink-0"
              >
                View all pending
              </button>
            )}
          </div>
          <div className="space-y-2">
            {pendingRequestApproval.map(s => (
              <div key={s.id} className="bg-white rounded border border-orange-200 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    {s.session_type === 'shop_time'
                      ? <Wrench className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                      : <BookOpen className="w-3.5 h-3.5 text-teal-600 mt-0.5 flex-shrink-0" />
                    }
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {s.assigned_profile?.full_name}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          s.session_type === 'shop_time'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-teal-100 text-teal-700'
                        }`}>
                          {s.session_type === 'shop_time' ? 'Shop Time' : 'Training'}
                        </span>
                        <span className="text-xs text-gray-500">{formatDate(s.session_date)}</span>
                        {s.predetermined_hours && (
                          <span className="text-xs text-blue-700 font-medium">{s.predetermined_hours}h</span>
                        )}
                      </div>
                      {s.request_reason && (
                        <p className="text-xs text-gray-600 mt-0.5 italic">"{s.request_reason}"</p>
                      )}

                      {/* Deny form inline */}
                      {showDenyFormFor === s.id && (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={denyReasonInput[s.id] || ''}
                            onChange={e => setDenyReasonInput(prev => ({ ...prev, [s.id]: e.target.value }))}
                            placeholder="Reason for denial (optional)"
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-red-400 focus:border-transparent"
                          />
                          <button
                            onClick={() => denyRequest(s)}
                            disabled={denyingId === s.id}
                            className="flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {denyingId === s.id ? '...' : 'Deny'}
                          </button>
                          <button
                            onClick={() => setShowDenyFormFor(null)}
                            className="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {showDenyFormFor !== s.id && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => approveRequest(s)}
                        disabled={approvingId === s.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        <ThumbsUp className="w-3 h-3" />
                        {approvingId === s.id ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => setShowDenyFormFor(s.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded text-xs font-medium hover:bg-red-100 transition-colors"
                      >
                        <ThumbsDown className="w-3 h-3" />
                        Deny
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Hour Approval Banner */}
      {pendingHourApproval.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-amber-800">
              {pendingHourApproval.length} session{pendingHourApproval.length > 1 ? 's' : ''} awaiting hour approval
            </span>
          </div>
          <div className="space-y-1.5">
            {pendingHourApproval.map(s => {
              const entry = s.time_entries[0];
              return (
                <div key={s.id} className="flex items-center justify-between bg-white rounded border border-amber-200 px-3 py-2">
                  <div className="flex items-center gap-2">
                    {s.session_type === 'shop_time'
                      ? <Wrench className="w-3.5 h-3.5 text-amber-600" />
                      : <BookOpen className="w-3.5 h-3.5 text-teal-600" />
                    }
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {s.assigned_profile?.full_name}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        {s.title} — {formatDate(s.session_date)} — {entry.total_hours.toFixed(2)}h
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => approveTimeEntry(s)}
                    disabled={approvingId === s.id}
                    className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    Approve
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header + Create */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Internal Sessions</h3>
          <p className="text-xs text-gray-500">Shop time & training appointments for employees</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Schedule Session
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />

        {/* Quick-filter: Needs Approval */}
        {pendingRequestApproval.length > 0 && (
          <button
            onClick={() => { setStatusFilter('pending_approval'); setDateFilter('all'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              statusFilter === 'pending_approval'
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Needs Approval ({pendingRequestApproval.length})
          </button>
        )}

        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(['upcoming', 'today', 'this_week', 'all'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDateFilter(d)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                dateFilter === d ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {d === 'this_week' ? 'This Week' : d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(['all', 'shop_time', 'training'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                typeFilter === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t === 'shop_time' ? 'Shop Time' : t === 'training' ? 'Training' : 'All Types'}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(['all', 'pending_approval', 'scheduled', 'in_progress', 'completed', 'cancelled', 'denied'] as const).map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                statusFilter === st ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {st === 'in_progress' ? 'Active'
               : st === 'pending_approval' ? 'Pending'
               : st.charAt(0).toUpperCase() + st.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Sessions List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">No sessions found</p>
          <p className="text-gray-400 text-xs mt-1">Adjust filters or schedule a new session</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(session => {
            const isExpanded = expandedId === session.id;
            const statusCfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.cancelled;
            const entry = session.time_entries?.[0];
            const hasSubmittedEntry = entry?.status === 'submitted';
            const hasApprovedEntry = entry?.status === 'approved';
            const isPendingRequest = session.status === 'pending_approval';
            const isDenied = session.status === 'denied';
            const isRequested = !!session.requested_by;

            return (
              <div
                key={session.id}
                className={`bg-white border rounded-lg overflow-hidden transition-all ${
                  isPendingRequest
                    ? 'border-l-4 border-l-orange-400 border-orange-200'
                    : isDenied
                    ? 'border-l-4 border-l-red-400 border-gray-200 opacity-70'
                    : session.session_type === 'shop_time'
                    ? 'border-l-4 border-l-amber-400 border-gray-200'
                    : 'border-l-4 border-l-teal-500 border-gray-200'
                }`}
              >
                <div className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      session.session_type === 'shop_time' ? 'bg-amber-100' : 'bg-teal-100'
                    }`}>
                      {session.session_type === 'shop_time'
                        ? <Wrench className="w-4 h-4 text-amber-600" />
                        : <BookOpen className="w-4 h-4 text-teal-600" />
                      }
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{session.title}</span>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusCfg.color}`}>
                              {statusCfg.label}
                            </span>
                            {isRequested && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                <User className="w-2.5 h-2.5" />
                                Self-Requested
                              </span>
                            )}
                            {hasSubmittedEntry && (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                Pending Hour Approval
                              </span>
                            )}
                            {hasApprovedEntry && (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-800 border border-green-200">
                                Hours Approved
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {session.assigned_profile?.full_name ?? 'Unknown'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(session.session_date)}
                            </span>
                            {session.predetermined_hours ? (
                              <span className="flex items-center gap-1 text-blue-600 font-medium">
                                <Clock className="w-3 h-3" />
                                {session.predetermined_hours}h preset
                              </span>
                            ) : (session.start_time ? (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime12(session.start_time)}
                                {session.end_time && ` – ${formatTime12(session.end_time)}`}
                              </span>
                            ) : null)}
                          </div>
                          {isDenied && session.denial_reason && (
                            <p className="mt-1 text-xs text-red-600 italic">Denied: "{session.denial_reason}"</p>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isPendingRequest && (
                            <>
                              <button
                                onClick={() => approveRequest(session)}
                                disabled={approvingId === session.id}
                                title="Approve request"
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                                {approvingId === session.id ? '...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => setShowDenyFormFor(showDenyFormFor === session.id ? null : session.id)}
                                title="Deny request"
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded text-xs font-medium hover:bg-red-100 transition-colors"
                              >
                                <ThumbsDown className="w-3.5 h-3.5" />
                                Deny
                              </button>
                            </>
                          )}
                          {session.predetermined_hours && session.status === 'scheduled' && !entry && (
                            <button
                              onClick={() => completeWithPredetermined(session)}
                              disabled={approvingId === session.id}
                              title="Complete and submit for approval"
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              <PlayCircle className="w-3.5 h-3.5" />
                              {approvingId === session.id ? 'Saving...' : 'Complete'}
                            </button>
                          )}
                          {hasSubmittedEntry && (
                            <button
                              onClick={() => approveTimeEntry(session)}
                              disabled={approvingId === session.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve
                            </button>
                          )}
                          {session.status !== 'completed' && session.status !== 'cancelled' && session.status !== 'denied' && (
                            <button
                              onClick={() => setEditingSession(session)}
                              title="Edit session"
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {session.status === 'scheduled' && (
                            <button
                              onClick={() => cancelSession(session)}
                              title="Cancel session"
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(profile?.role === 'admin' ||
                            (session.requested_by === profile?.id &&
                              (session.status === 'pending_approval' || session.status === 'denied'))) && (
                            <button
                              onClick={() => setConfirmDelete(session)}
                              title="Delete session"
                              disabled={deletingId === session.id}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(session.description || session.notes || entry || session.request_reason) && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : session.id)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline deny form per row */}
                      {showDenyFormFor === session.id && isPendingRequest && (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={denyReasonInput[session.id] || ''}
                            onChange={e => setDenyReasonInput(prev => ({ ...prev, [session.id]: e.target.value }))}
                            placeholder="Reason for denial (optional)"
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-red-400 focus:border-transparent"
                          />
                          <button
                            onClick={() => denyRequest(session)}
                            disabled={denyingId === session.id}
                            className="flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {denyingId === session.id ? '...' : 'Confirm Deny'}
                          </button>
                          <button
                            onClick={() => setShowDenyFormFor(null)}
                            className="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-3 pt-1 bg-gray-50 border-t border-gray-100 space-y-2">
                    {session.request_reason && (
                      <div>
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Employee's Reason</div>
                        <p className="text-sm text-gray-700 italic">"{session.request_reason}"</p>
                      </div>
                    )}
                    {session.description && (
                      <div>
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Instructions</div>
                        <p className="text-sm text-gray-700">{session.description}</p>
                      </div>
                    )}
                    {session.notes && (
                      <div>
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Admin Notes</div>
                        <p className="text-sm text-gray-600 italic">{session.notes}</p>
                      </div>
                    )}
                    {entry && (
                      <div>
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Time Entry</div>
                        <div className="flex items-center gap-3 text-xs text-gray-600">
                          <span>{entry.total_hours.toFixed(2)}h</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            entry.status === 'approved' ? 'bg-green-100 text-green-800' :
                            entry.status === 'submitted' ? 'bg-amber-100 text-amber-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {entry.status}
                          </span>
                          {entry.clock_in && (
                            <span>In: {new Date(entry.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                          )}
                          {entry.clock_out && (
                            <span>Out: {new Date(entry.clock_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                          )}
                        </div>
                        {entry.status === 'approved' && session.approver_profile && (
                          <p className="text-[11px] text-green-700 mt-0.5 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Approved by {session.approver_profile.full_name}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {(showCreateModal || editingSession) && (
        <CreateInternalSessionModal
          sessionToEdit={editingSession}
          onClose={() => {
            setShowCreateModal(false);
            setEditingSession(null);
          }}
          onSave={loadSessions}
        />
      )}

      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Delete Session"
        message={confirmDelete
          ? `Delete "${confirmDelete.title}" for ${confirmDelete.assigned_profile?.full_name} on ${formatDate(confirmDelete.session_date)}?\n\nThis cannot be undone.`
          : ''}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDelete) deleteSession(confirmDelete);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
