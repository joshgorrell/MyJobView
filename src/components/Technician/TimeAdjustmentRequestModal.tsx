import { createTimestampInTimezone, formatDateInTimezone, formatTimeInTimezone, getOrganizationTimezone } from '../../lib/timezoneUtils';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Clock, Calendar, Send, AlertCircle } from 'lucide-react';

interface ClockEntry {
  id: string;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  break_minutes: number;
}

interface Props {
  entry: ClockEntry;
  onClose: () => void;
  onSubmit: () => void;
}

export function TimeAdjustmentRequestModal({ entry, onClose, onSubmit }: Props) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  const [timezone,setTimezone]=useState('');
  const [requestedClockIn,setRequestedClockIn]=useState('');
  const [requestedClockOut,setRequestedClockOut]=useState('');
  const [requestedEndDate,setRequestedEndDate]=useState(entry.entry_date);
  useEffect(()=>{void getOrganizationTimezone().then(tz=>{
    setTimezone(tz);setRequestedClockIn(formatTimeInTimezone(entry.clock_in,tz));
    setRequestedClockOut(entry.clock_out?formatTimeInTimezone(entry.clock_out,tz):'');
    setRequestedEndDate(entry.clock_out?formatDateInTimezone(entry.clock_out,tz):entry.entry_date);
  });},[entry.id]);
  const [reasonCategory, setReasonCategory] = useState('wrong_time');
  const [explanation, setExplanation] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!timezone) return;
    if (!explanation.trim()) {
      alert('Please provide an explanation for this request');
      return;
    }

    setLoading(true);
    try {
      // Build full timestamps for requested times
      const entryDate = entry.entry_date;
      const requestedClockInTimestamp = createTimestampInTimezone(entryDate,requestedClockIn,timezone);
      let requestedClockOutTimestamp = null;

      if (requestedClockOut) {
        requestedClockOutTimestamp = createTimestampInTimezone(requestedEndDate,requestedClockOut,timezone);
      }

      if(requestedClockOutTimestamp && new Date(requestedClockOutTimestamp)<=new Date(requestedClockInTimestamp)) throw new Error('Clock out must be after clock in. Select the next date for overnight work.');
      const { error } = await supabase
        .from('time_adjustment_requests')
        .insert({
          daily_clock_entry_id: entry.id,
          technician_id: profile?.id,
          current_clock_in: entry.clock_in,
          current_clock_out: entry.clock_out,
          requested_clock_in: requestedClockInTimestamp,
          requested_clock_out: requestedClockOutTimestamp,
          reason_category: reasonCategory,
          explanation: explanation.trim(),
          status: 'pending'
        });

      if (error) throw error;

      alert('Time adjustment request submitted successfully! You will be notified when it is reviewed.');
      onSubmit();
    } catch (error: any) {
      console.error('Error submitting request:', error);
      alert(error.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6" />
              <div>
                <h2 className="text-2xl font-bold">Request Time Adjustment</h2>
                <p className="text-blue-100 text-sm">
                  Submit a request to modify your clock entry
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Entry Date</h3>
            </div>
            <div className="text-lg font-medium text-gray-900">
              {new Date(entry.entry_date).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Current Times */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-600" />
                Current Times
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Clock In</div>
                  <div className="text-lg font-mono font-medium text-gray-900">
                    {new Date(entry.clock_in).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true, timeZone:timezone||'America/Chicago'
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Clock Out</div>
                  <div className="text-lg font-mono font-medium text-gray-900">
                    {entry.clock_out ? (
                      new Date(entry.clock_out).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true, timeZone:timezone||'America/Chicago'
                      })
                    ) : (
                      <span className="text-blue-600">Not clocked out</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Requested Times */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Requested Times
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-700 mb-1 font-medium">
                    Clock In Time *
                  </label>
                  <input
                    type="time"
                    step="1800"
                    value={requestedClockIn}
                    onChange={(e) => setRequestedClockIn(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1 font-medium">
                    Clock Out Time
                  </label>
                  <input
                    type="time"
                    step="1800"
                    value={requestedClockOut}
                    onChange={(e) => setRequestedClockOut(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <label className="block text-xs text-gray-700 mt-2">Clock out date<input type="date" required={!!requestedClockOut} min={entry.entry_date} value={requestedEndDate} onChange={e=>setRequestedEndDate(e.target.value)} className="block w-full border rounded-lg p-2" /></label>
                  <p className="text-xs text-gray-500 mt-1">
                    Leave blank if still clocked in
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason Category *
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="forgot_clock_in">Forgot to Clock In</option>
              <option value="forgot_clock_out">Forgot to Clock Out</option>
              <option value="wrong_time">Wrong Time Entered</option>
              <option value="system_error">System Error</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Detailed Explanation *
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              required
              rows={4}
              placeholder="Please explain why you need to adjust these times..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Provide specific details about why this adjustment is needed
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Request Review Process</p>
              <p>
                Your request will be reviewed by an administrator. You will receive a notification
                when your request is approved or denied. If approved, your time entry will be
                automatically updated.
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
