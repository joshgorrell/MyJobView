import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { WorkOrderDetail } from './WorkOrderDetail';
import { CreateWorkOrderModal } from './CreateWorkOrderModal';
import { gpsTrackingService } from '../../lib/gpsTracking';
import { updateClockEntryAddress } from '../../lib/reverseGeocode';
import { Calendar, CheckCircle, Wrench, Camera, Award, Play, AlertCircle, Package, User, Send, Plus, Clock, Coffee, CreditCard as Edit2, Briefcase, BookOpen } from 'lucide-react';
import { TimeAdjustmentRequestModal } from '../Technician/TimeAdjustmentRequestModal';
import { AssignedSessionsWidget } from './AssignedSessionsWidget';

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  priority: string;
  target_completion_date: string;
  on_my_way_sent_at: string | null;
  project: {
    name: string;
    customer_name: string;
  };
}

interface Stats {
  todayJobs: number;
  completedToday: number;
  pendingParts: number;
  photosToday: number;
  weeklyCompleted: number;
}

interface ClockEntry {
  id: string;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  break_minutes: number;
  status: string;
  notes: string | null;
  offline_entry: boolean;
  breaks: ClockBreak[];
}

interface ClockBreak {
  id: string;
  break_start: string;
  break_end: string | null;
  break_duration_minutes: number;
  break_type: string;
}

interface InternalTimeEntry {
  id: string;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  entry_type: 'shop_time' | 'training';
  notes: string | null;
  status: string;
  session_title: string | null;
}

type TimeEventKind = 'job_time' | 'shop_time' | 'training';

interface TimeEvent {
  id: string;
  kind: TimeEventKind;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  status: string;
  notes: string | null;
  // job_time only
  break_minutes?: number;
  offline_entry?: boolean;
  breaks?: ClockBreak[];
  rawEntry?: ClockEntry;
  // shop_time / training only
  session_title?: string | null;
}

export function TechnicianWorkCenter() {
  const { profile } = useAuth();
  const canCreateWorkOrder =
    profile?.role === 'admin' ||
    profile?.role === 'manager' ||
    profile?.can_create_work_orders === true;
  const [myJobs, setMyJobs] = useState<WorkOrder[]>([]);
  const [inProgressJobs, setInProgressJobs] = useState<WorkOrder[]>([]);
  const [stats, setStats] = useState<Stats>({
    todayJobs: 0,
    completedToday: 0,
    pendingParts: 0,
    photosToday: 0,
    weeklyCompleted: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [sendingNotification, setSendingNotification] = useState<string | null>(null);
  const [showCreateWorkOrder, setShowCreateWorkOrder] = useState(false);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [checkingPermission, setCheckingPermission] = useState(true);
  const [clockEntries, setClockEntries] = useState<ClockEntry[]>([]);
  const [timeEvents, setTimeEvents] = useState<TimeEvent[]>([]);
  const [requestingAdjustmentEntry, setRequestingAdjustmentEntry] = useState<ClockEntry | null>(null);

  useEffect(() => {
    if (profile) {
      loadData();
      checkLocationPermission();

      // Start GPS pre-warming when component mounts
      if (navigator.geolocation) {
        gpsTrackingService.startPreWarming();
      }
    }

    return () => {
      // Stop GPS pre-warming when component unmounts
      gpsTrackingService.stopPreWarming();
    };
  }, [profile]);

  async function loadClockEntries() {
    if (!profile) return;

    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [{ data: dailyData, error: dailyError }, { data: internalData }] = await Promise.all([
        supabase
          .from('daily_clock_entries')
          .select('*, breaks:daily_clock_breaks(*)')
          .eq('technician_id', profile.id)
          .gte('entry_date', weekAgo)
          .order('entry_date', { ascending: false }),
        supabase
          .from('time_entries')
          .select('id, entry_date, clock_in, clock_out, total_hours, entry_type, notes, status, internal_time_sessions(title)')
          .eq('technician_id', profile.id)
          .in('entry_type', ['shop_time', 'training'])
          .gte('entry_date', weekAgo)
          .order('entry_date', { ascending: false }),
      ]);

      if (dailyError) throw dailyError;

      const daily = (dailyData || []) as ClockEntry[];
      setClockEntries(daily);

      const internalEntries: InternalTimeEntry[] = (internalData || []).map((row: any) => ({
        id: row.id,
        entry_date: row.entry_date,
        clock_in: row.clock_in,
        clock_out: row.clock_out,
        total_hours: row.total_hours,
        entry_type: row.entry_type,
        notes: row.notes,
        status: row.status,
        session_title: row.internal_time_sessions?.title ?? null,
      }));

      const jobEvents: TimeEvent[] = daily.map(e => ({
        id: e.id,
        kind: 'job_time',
        entry_date: e.entry_date,
        clock_in: e.clock_in,
        clock_out: e.clock_out,
        total_hours: e.total_hours,
        status: e.status,
        notes: e.notes,
        break_minutes: e.break_minutes,
        offline_entry: e.offline_entry,
        breaks: e.breaks,
        rawEntry: e,
      }));

      const internalEvents: TimeEvent[] = internalEntries.map(e => ({
        id: e.id,
        kind: e.entry_type,
        entry_date: e.entry_date,
        clock_in: e.clock_in,
        clock_out: e.clock_out,
        total_hours: e.total_hours,
        status: e.status,
        notes: e.notes,
        session_title: e.session_title,
      }));

      const merged = [...jobEvents, ...internalEvents].sort((a, b) => {
        const dateDiff = b.entry_date.localeCompare(a.entry_date);
        if (dateDiff !== 0) return dateDiff;
        return b.clock_in.localeCompare(a.clock_in);
      });

      setTimeEvents(merged);
    } catch (error) {
      console.error('Error loading clock entries:', error);
    }
  }

  async function loadData() {
    if (!profile) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [
        assignedJobsResult,
        inProgressResult,
        completedTodayResult,
        partsResult,
        photosResult,
        weeklyCompletionsResult,
      ] = await Promise.all([
        supabase
          .from('work_orders')
          .select('*, project:projects(name, customer_name), on_my_way_sent_at')
          .eq('assigned_to', profile.id)
          .in('status', ['assigned', 'pending'])
          .order('target_completion_date'),
        supabase
          .from('work_orders')
          .select('*, project:projects(name, customer_name), on_my_way_sent_at')
          .eq('assigned_to', profile.id)
          .eq('status', 'in_progress')
          .order('target_completion_date'),
        supabase
          .from('work_orders')
          .select('id')
          .eq('assigned_to', profile.id)
          .eq('status', 'completed')
          .gte('actual_completion_date', today),
        supabase
          .from('parts_requests')
          .select('id')
          .eq('technician_id', profile.id)
          .eq('status', 'pending'),
        supabase
          .from('job_photos')
          .select('id')
          .eq('technician_id', profile.id)
          .gte('captured_at', today),
        supabase
          .from('job_completions')
          .select('id')
          .eq('technician_id', profile.id)
          .gte('completed_at', weekAgo),
      ]);

      setMyJobs(assignedJobsResult.data || []);
      setInProgressJobs(inProgressResult.data || []);

      setStats({
        todayJobs: (assignedJobsResult.data?.length || 0) + (inProgressResult.data?.length || 0),
        completedToday: completedTodayResult.data?.length || 0,
        pendingParts: partsResult.data?.length || 0,
        photosToday: photosResult.data?.length || 0,
        weeklyCompleted: weeklyCompletionsResult.data?.length || 0
      });

      // Load clock entries
      await loadClockEntries();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }


  async function handleOnMyWay(jobId: string) {
    if (!profile) return;

    setSendingNotification(jobId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-on-my-way-sms`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ workOrderId: jobId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send notification');
      }

      alert('Customer notified! ' + (result.smsDelivered ? 'SMS sent successfully.' : 'Notification logged.'));
      loadData();
    } catch (error: any) {
      console.error('Error sending notification:', error);
      alert(error.message || 'Failed to send notification');
    } finally {
      setSendingNotification(null);
    }
  }

  async function checkLocationPermission() {
    setCheckingPermission(true);

    console.log('=== Location Permission Check (Job Clock) ===');
    console.log('User Agent:', navigator.userAgent);
    console.log('Protocol:', window.location.protocol);
    console.log('Has Geolocation:', !!navigator.geolocation);

    const declined = localStorage.getItem('gps_permission_declined');
    if (declined === 'true') {
      console.log('Permission was previously declined');
      setLocationPermission('denied');
      setCheckingPermission(false);
      return;
    }

    const state = await gpsTrackingService.getPermissionState();
    console.log('Permission state:', state);
    setLocationPermission(state);
    setCheckingPermission(false);

    if (state === 'prompt') {
      console.log('Permission is in prompt state - waiting for user to click Start button');
    }
  }

  async function startJob(jobId: string) {
    if (!profile) return;
    await performJobStart(jobId);
  }

  async function performJobStart(jobId: string) {
    if (!profile) return;

    try {
      // Update work order status to in_progress
      const { error: woError } = await supabase
        .from('work_orders')
        .update({ status: 'in_progress' })
        .eq('id', jobId);

      if (woError) throw woError;

      // Create time_entry immediately without GPS data
      const now = new Date();
      const entryData: any = {
        technician_id: profile.id,
        work_order_id: jobId,
        entry_date: now.toISOString().split('T')[0],
        clock_in: now.toISOString(),
        clock_out: null,
        total_hours: 0,
        break_minutes: 0,
        status: 'draft',
      };

      const { data: insertedEntry, error: timeError } = await supabase
        .from('time_entries')
        .insert(entryData)
        .select()
        .single();

      if (timeError) throw timeError;

      // Start GPS breadcrumb tracking
      await gpsTrackingService.startTracking(profile.id, undefined, jobId);

      if (insertedEntry && navigator.geolocation) {
        gpsTrackingService.captureLocationForClockEvent(false).then(async (gpsResult) => {
          try {
            const { data: scoreData } = await supabase.rpc('calculate_gps_quality_score', {
              p_accuracy: gpsResult.accuracy,
              p_method: gpsResult.method,
              p_duration_ms: gpsResult.duration_ms,
              p_refined: false,
              p_original_accuracy: null
            });

            await supabase
              .from('time_entries')
              .update({
                clock_in_latitude: gpsResult.latitude,
                clock_in_longitude: gpsResult.longitude,
                clock_in_gps_accuracy: gpsResult.accuracy,
                clock_in_gps_capture_method: gpsResult.method,
                clock_in_gps_duration_ms: gpsResult.duration_ms,
                clock_in_gps_attempted_at: gpsResult.attempted_at,
                clock_in_gps_captured_at: gpsResult.captured_at,
                clock_in_gps_quality_score: scoreData || 0,
              })
              .eq('id', insertedEntry.id);

            if (gpsResult.latitude && gpsResult.longitude) {
              updateClockEntryAddress(insertedEntry.id, gpsResult.latitude, gpsResult.longitude, false, 'time_entries').catch(() => {});
            }

            if (gpsResult.accuracy && gpsResult.accuracy > 50) {
              gpsTrackingService.startPostCaptureRefinement(insertedEntry.id, false, 'time_entries');
            }
          } catch (error) {
            console.error('GPS metadata update failed:', error);
          }
        }).catch(() => {});
      }

      loadData();
    } catch (error) {
      console.error('Error starting job:', error);
      alert('Failed to start job');
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'assigned':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'urgent':
        return 'border-l-4 border-red-500';
      case 'high':
        return 'border-l-4 border-orange-500';
      case 'medium':
        return 'border-l-4 border-yellow-500';
      default:
        return 'border-l-4 border-gray-300';
    }
  }

  function formatTime12Hour(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function getStatusBadgeColor(status: string) {
    switch (status) {
      case 'clocked_in':
        return 'bg-green-100 text-green-800';
      case 'clocked_out':
        return 'bg-gray-100 text-gray-800';
      case 'on_break':
        return 'bg-yellow-100 text-yellow-800';
      case 'auto_clocked_out':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  if (selectedWorkOrderId) {
    return (
      <WorkOrderDetail
        workOrderId={selectedWorkOrderId}
        onBack={() => {
          setSelectedWorkOrderId(null);
          loadData();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">My Work Center</h1>
          <p className="text-sm text-gray-300">Welcome back, {profile?.full_name}</p>
        </div>
        {canCreateWorkOrder && (
          <button
            onClick={() => setShowCreateWorkOrder(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 active:bg-green-800 font-medium shadow-md w-full sm:w-auto text-sm sm:text-base transition-colors"
          >
            <Plus className="w-5 h-5 flex-shrink-0" />
            <span>New Work Order</span>
          </button>
        )}
      </div>

      {(locationPermission === 'prompt' || locationPermission === 'unknown') && !checkingPermission && myJobs.length > 0 && (
        <div className="bg-blue-500 text-white rounded-xl p-4 text-center">
          <AlertCircle className="w-6 h-6 mx-auto mb-2" />
          <p className="font-semibold mb-1">Location Permission Required</p>
          <p className="text-sm opacity-90">
            When you tap "Start" on a job, your device will ask for location permission. You must tap "Allow" to start the job.
          </p>
        </div>
      )}

      {/* Today's Stats */}
      <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        {[
          { icon: <Calendar className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />, label: "Today's Jobs", value: stats.todayJobs, color: 'text-gray-900' },
          { icon: <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />, label: 'Completed', value: stats.completedToday, color: 'text-green-600' },
          { icon: <Wrench className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />, label: 'Parts', value: stats.pendingParts, color: 'text-orange-600' },
          { icon: <Camera className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />, label: 'Photos', value: stats.photosToday, color: 'text-blue-600' },
          { icon: <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />, label: 'My Hours', value: `${timeEvents.reduce((s, e) => s + (e.total_hours || 0), 0).toFixed(1)}h`, color: 'text-green-600' },
          { icon: <Package className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />, label: 'This Week', value: stats.weeklyCompleted, color: 'text-gray-900' },
        ].map(({ icon, label, value, color }) => (
          <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 sm:p-4">
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1.5 min-w-0">
              {icon}
              <span className="truncate leading-tight">{label}</span>
            </div>
            <div className={`text-xl sm:text-3xl font-bold ${color} leading-none`}>{value}</div>
          </div>
        ))}
      </div>

      {/* In Progress Jobs */}
      {inProgressJobs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Play className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            <h2 className="text-base sm:text-lg font-bold text-gray-900">In Progress</h2>
            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
              {inProgressJobs.length}
            </span>
          </div>
          <div className="space-y-3">
            {inProgressJobs.map(job => (
              <button
                key={job.id}
                onClick={() => setSelectedWorkOrderId(job.id)}
                className={`w-full text-left border border-gray-200 rounded-xl p-3 sm:p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors ${getPriorityColor(job.priority)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{job.work_order_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(job.status)}`}>
                        {job.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <h3 className="text-gray-900 font-medium text-sm truncate">{job.title}</h3>
                    <p className="text-gray-500 text-xs truncate mt-0.5">{job.project?.customer_name}</p>
                    {job.target_completion_date && (
                      <p className="text-xs text-gray-400 mt-1">
                        Due: {new Date(job.target_completion_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {job.priority === 'urgent' && (
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Assigned Internal Sessions */}
      <AssignedSessionsWidget onRefreshParent={loadData} />

      {/* Assigned Jobs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
          <h2 className="text-base sm:text-lg font-bold text-gray-900">Assigned Jobs</h2>
          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
            {myJobs.length}
          </span>
        </div>

        {myJobs.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No jobs assigned</p>
            <p className="text-sm text-gray-400 mt-1">Check back later for new assignments</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myJobs.map(job => (
              <div
                key={job.id}
                className={`border border-gray-200 rounded-xl p-3 sm:p-4 ${getPriorityColor(job.priority)}`}
              >
                {/* Job info */}
                <div className="mb-3 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-semibold text-gray-900 text-sm">{job.work_order_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(job.status)}`}>
                        {job.status.replace(/_/g, ' ')}
                      </span>
                      {job.priority === 'urgent' && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium whitespace-nowrap">
                          Urgent
                        </span>
                      )}
                    </div>
                    {job.priority === 'urgent' && (
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                  <h3 className="text-gray-900 font-medium text-sm leading-snug">{job.title}</h3>
                  <p className="text-gray-500 text-xs truncate mt-0.5">{job.project?.customer_name}</p>
                  {job.target_completion_date && (
                    <p className="text-xs text-gray-400 mt-1">
                      Due: {new Date(job.target_completion_date).toLocaleDateString()}
                    </p>
                  )}
                  {job.on_my_way_sent_at && (
                    <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 flex-shrink-0" />
                      Notified at {new Date(job.on_my_way_sent_at).toLocaleTimeString()}
                    </p>
                  )}
                </div>
                {/* Action buttons — full width row on mobile */}
                <div className="flex gap-2">
                  <button
                    onClick={() => startJob(job.id)}
                    disabled={checkingPermission || locationPermission === 'denied'}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    title={locationPermission === 'denied' ? 'Location permission required' : ''}
                  >
                    <Play className="w-3.5 h-3.5 flex-shrink-0" />
                    {locationPermission === 'denied' ? 'GPS Required' : 'Start'}
                  </button>
                  <button
                    onClick={() => setSelectedWorkOrderId(job.id)}
                    className="flex-1 flex items-center justify-center px-3 py-2.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors"
                  >
                    View
                  </button>
                  {!job.on_my_way_sent_at && (
                    <button
                      onClick={() => handleOnMyWay(job.id)}
                      disabled={sendingNotification === job.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 active:bg-green-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5 flex-shrink-0" />
                      {sendingNotification === job.id ? '...' : 'On Way'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Time - Clock History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 flex-shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-gray-900">My Time</h2>
            <span className="text-xs text-gray-500 whitespace-nowrap">(Last 7 days)</span>
          </div>
        </div>

        {timeEvents.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <Clock className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-sm sm:text-base text-gray-500">No clock entries yet</p>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">Your time entries will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {timeEvents.map(event => {
              const kindMeta = {
                job_time: {
                  label: 'Job Time',
                  icon: <Briefcase className="w-3 h-3" />,
                  badge: 'bg-blue-100 text-blue-800',
                  border: 'border-gray-200',
                },
                shop_time: {
                  label: 'Shop Time',
                  icon: <Wrench className="w-3 h-3" />,
                  badge: 'bg-amber-100 text-amber-800',
                  border: 'border-amber-200',
                },
                training: {
                  label: 'Training',
                  icon: <BookOpen className="w-3 h-3" />,
                  badge: 'bg-teal-100 text-teal-800',
                  border: 'border-teal-200',
                },
              }[event.kind];

              return (
                <div key={`${event.kind}-${event.id}`} className={`border ${kindMeta.border} rounded-lg p-3 sm:p-4 hover:bg-gray-50 transition-colors`}>
                  <div className="flex flex-col gap-3">
                    {/* Date, Type Badge and Status Row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Type pill */}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${kindMeta.badge}`}>
                        {kindMeta.icon}
                        {kindMeta.label}
                      </span>

                      {/* For shop/training show session title; for job time show date */}
                      {event.kind === 'job_time' ? (
                        <span className="font-semibold text-sm sm:text-base text-gray-900">
                          {new Date(event.entry_date).toLocaleDateString('en-US', {
                            weekday: 'short', month: 'short', day: 'numeric'
                          })}
                        </span>
                      ) : (
                        <>
                          {event.session_title && (
                            <span className="font-semibold text-sm sm:text-base text-gray-900 truncate">
                              {event.session_title}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            {new Date(event.entry_date).toLocaleDateString('en-US', {
                              weekday: 'short', month: 'short', day: 'numeric'
                            })}
                          </span>
                        </>
                      )}

                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusBadgeColor(event.status)}`}>
                        {event.status.replace(/_/g, ' ')}
                      </span>
                      {event.offline_entry && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium whitespace-nowrap">
                          Offline
                        </span>
                      )}
                    </div>

                    {/* Time Details */}
                    <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2">
                      <div className="flex items-center justify-between sm:block">
                        <span className="text-xs sm:text-sm text-gray-600">Clock In:</span>
                        <span className="text-sm sm:text-base ml-2 font-semibold text-gray-900">{formatTime12Hour(event.clock_in)}</span>
                      </div>
                      {event.clock_out && (
                        <div className="flex items-center justify-between sm:block">
                          <span className="text-xs sm:text-sm text-gray-600">Clock Out:</span>
                          <span className="text-sm sm:text-base ml-2 font-semibold text-gray-900">{formatTime12Hour(event.clock_out)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between sm:block">
                        <span className="text-xs sm:text-sm text-gray-600">Total Hours:</span>
                        <span className="text-sm sm:text-base ml-2 font-semibold text-green-700">{event.total_hours.toFixed(2)}</span>
                      </div>
                      {(event.break_minutes ?? 0) > 0 && (
                        <div className="flex items-center justify-between sm:block">
                          <span className="text-xs sm:text-sm text-gray-600 flex items-center gap-1">
                            <Coffee className="w-3 h-3 text-gray-500" />
                            Break Time:
                          </span>
                          <span className="text-sm sm:text-base ml-2 font-semibold text-gray-900">{event.break_minutes} min</span>
                        </div>
                      )}
                    </div>

                    {/* Break Details (job_time only) */}
                    {event.breaks && event.breaks.length > 0 && (
                      <div className="mt-2 pt-3 border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-600 mb-2">Break Details:</p>
                        <div className="space-y-2">
                          {event.breaks.map(brk => (
                            <div key={brk.id} className="text-xs text-gray-700 bg-gray-50 rounded p-2">
                              <div className="flex items-start gap-2">
                                <Coffee className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="capitalize font-medium">{brk.break_type}</span>
                                    {brk.break_end && (
                                      <span className="text-gray-500">({brk.break_duration_minutes} min)</span>
                                    )}
                                    {!brk.break_end && (
                                      <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                                        In Progress
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-gray-600 mt-1">
                                    <span>{formatTime12Hour(brk.break_start)}</span>
                                    {brk.break_end && (
                                      <>
                                        <span className="mx-1">→</span>
                                        <span>{formatTime12Hour(brk.break_end)}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {event.notes && (
                      <div className="mt-2 pt-3 border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-600 mb-1">Notes:</p>
                        <p className="text-xs sm:text-sm text-gray-700 bg-gray-50 rounded p-2">{event.notes}</p>
                      </div>
                    )}

                    {/* Request Time Change — job_time only */}
                    {event.kind === 'job_time' && event.rawEntry && (
                      <div className="pt-2">
                        <button
                          onClick={() => setRequestingAdjustmentEntry(event.rawEntry!)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors"
                        >
                          <Edit2 className="w-4 h-4 flex-shrink-0" />
                          <span>Request Time Change</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Help Banner */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs sm:text-sm text-blue-900">
                <p className="font-semibold mb-1">Need to adjust your time?</p>
                <p className="text-blue-700">Tap "Request Time Change" to submit a time adjustment request to your manager for review.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Work Order Modal */}
      {canCreateWorkOrder && showCreateWorkOrder && profile && (
        <CreateWorkOrderModal
          onClose={() => setShowCreateWorkOrder(false)}
          onSuccess={() => {
            setShowCreateWorkOrder(false);
            loadData();
          }}
          initialTechnicianIds={[profile.id]}
        />
      )}

      {/* Time Adjustment Request Modal */}
      {requestingAdjustmentEntry && (
        <TimeAdjustmentRequestModal
          entry={requestingAdjustmentEntry}
          onClose={() => setRequestingAdjustmentEntry(null)}
          onSuccess={() => {
            setRequestingAdjustmentEntry(null);
            loadClockEntries();
          }}
        />
      )}
    </div>
  );
}
