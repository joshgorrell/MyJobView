import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Clock, Calendar, Coffee, Lock, AlertCircle, Edit2, XCircle, CheckCircle, Clock3 } from 'lucide-react';
import { TimeAdjustmentRequestModal } from './TimeAdjustmentRequestModal';
import ConfirmModal from '../ui/ConfirmModal';

interface ClockEntry {
  id: string;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  break_minutes: number;
  status: string;
  notes: string | null;
  admin_adjusted: boolean;
  adjustment_reason: string | null;
}

interface TimeRequest {
  id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  admin_notes: string | null;
}

export function MyTimeView() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  const [requests, setRequests] = useState<Record<string, TimeRequest>>({});
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<ClockEntry | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    if (profile?.id) {
      loadEntries();
      loadRequests();

      // Subscribe to changes
      const channel = supabase
        .channel('my-time-changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'daily_clock_entries',
          filter: `technician_id=eq.${profile.id}`
        }, () => {
          loadEntries();
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'time_adjustment_requests',
          filter: `technician_id=eq.${profile.id}`
        }, () => {
          loadRequests();
        })
        .subscribe();

      return () => {
        channel.unsubscribe();
      };
    }
  }, [profile?.id]);

  async function loadEntries() {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('daily_clock_entries')
        .select('*')
        .eq('technician_id', profile?.id)
        .gte('entry_date', sevenDaysAgo.toISOString().split('T')[0])
        .order('entry_date', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error loading entries:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadRequests() {
    try {
      const { data, error } = await supabase
        .from('time_adjustment_requests')
        .select('*')
        .eq('technician_id', profile?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Create a map of entry_id -> most recent request
      const requestMap: Record<string, TimeRequest> = {};
      data?.forEach(req => {
        if (!requestMap[req.daily_clock_entry_id] ||
            new Date(req.created_at) > new Date(requestMap[req.daily_clock_entry_id].created_at)) {
          requestMap[req.daily_clock_entry_id] = req;
        }
      });
      setRequests(requestMap);
    } catch (error) {
      console.error('Error loading requests:', error);
    }
  }

  async function cancelRequest(requestId: string) {
    try {
      const { error } = await supabase
        .from('time_adjustment_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId);

      if (error) throw error;
      loadRequests();
    } catch (error) {
      console.error('Error cancelling request:', error);
      alert('Failed to cancel request');
    }
  }

  function canRequestEdit(entry: ClockEntry): boolean {
    const entryDate = new Date(entry.entry_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    entryDate.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff <= 2;
  }

  function getRequestStatusBadge(status: string) {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">
            <Clock3 className="w-3 h-3" />
            Pending Review
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-300">
            <CheckCircle className="w-3 h-3" />
            Approved
          </span>
        );
      case 'denied':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-300">
            <XCircle className="w-3 h-3" />
            Denied
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-300">
            <XCircle className="w-3 h-3" />
            Cancelled
          </span>
        );
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading your time entries...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-100">
            <p className="font-semibold mb-1">Edit Time Window</p>
            <p>
              You can request edits to your time entries for up to 2 days after the entry date.
              Entries older than 2 days are locked and require admin assistance.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {entries.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No time entries in the last 7 days</p>
          </div>
        ) : (
          entries.map(entry => {
            const canEdit = canRequestEdit(entry);
            const request = requests[entry.id];
            const entryDate = new Date(entry.entry_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            entryDate.setHours(0, 0, 0, 0);
            const daysDiff = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

            return (
              <div
                key={entry.id}
                className={`bg-white rounded-lg shadow-sm border-2 ${
                  request?.status === 'pending' ? 'border-orange-300' :
                  request?.status === 'approved' ? 'border-green-300' :
                  request?.status === 'denied' ? 'border-red-300' :
                  'border-gray-200'
                } p-4`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <Calendar className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="font-semibold text-gray-900">
                          {new Date(entry.entry_date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {daysDiff === 0 ? 'Today' :
                           daysDiff === 1 ? 'Yesterday' :
                           `${daysDiff} days ago`}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Clock In</div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">
                            {new Date(entry.clock_in).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Clock Out</div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">
                            {entry.clock_out ? (
                              new Date(entry.clock_out).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })
                            ) : (
                              <span className="text-blue-600">Still Clocked In</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <span className="text-gray-500">Total Hours:</span>
                        <span className="ml-2 font-semibold text-gray-900">
                          {entry.total_hours.toFixed(2)}h
                        </span>
                      </div>
                      {entry.break_minutes > 0 && (
                        <div className="flex items-center gap-1">
                          <Coffee className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-500">Break:</span>
                          <span className="ml-1 text-gray-900">{entry.break_minutes}m</span>
                        </div>
                      )}
                    </div>

                    {entry.admin_adjusted && entry.adjustment_reason && (
                      <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                        <span className="font-medium">Admin Adjusted:</span> {entry.adjustment_reason}
                      </div>
                    )}

                    {entry.notes && (
                      <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                        <span className="font-medium">Notes:</span> {entry.notes}
                      </div>
                    )}

                    {request && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          {getRequestStatusBadge(request.status)}
                          {request.status === 'pending' && (
                            <span className="text-xs text-gray-500">
                              Submitted {new Date(request.created_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {request.status === 'denied' && request.admin_notes && (
                          <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                            <span className="font-medium">Admin Response:</span> {request.admin_notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {canEdit ? (
                      <>
                        {!request || request.status === 'denied' ? (
                          <button
                            onClick={() => {
                              setSelectedEntry(entry);
                              setShowRequestModal(true);
                            }}
                            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                          >
                            <Edit2 className="w-4 h-4" />
                            Request Edit
                          </button>
                        ) : request.status === 'pending' ? (
                          <button
                            onClick={() => setConfirmModal({ title: 'Cancel Request', message: 'Are you sure you want to cancel this request?', onConfirm: () => cancelRequest(request.id) })}
                            className="px-3 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
                          >
                            <XCircle className="w-4 h-4" />
                            Cancel Request
                          </button>
                        ) : null}
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                          <CheckCircle className="w-3 h-3" />
                          Editable
                        </span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300">
                        <Lock className="w-3 h-3" />
                        Locked
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showRequestModal && selectedEntry && (
        <TimeAdjustmentRequestModal
          entry={selectedEntry}
          onClose={() => {
            setShowRequestModal(false);
            setSelectedEntry(null);
          }}
          onSubmit={() => {
            loadRequests();
            setShowRequestModal(false);
            setSelectedEntry(null);
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
