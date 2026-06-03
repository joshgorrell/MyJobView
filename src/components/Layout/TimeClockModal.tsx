import { useState, useEffect } from 'react';
import {
  X, Clock, Play, StopCircle, Coffee, User, Pause, WifiOff,
  Briefcase, Wrench, GraduationCap, ChevronRight, CheckCircle,
  AlertCircle, Loader2, Send, MapPin
} from 'lucide-react';
import { useToast } from '../Shared/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { gpsTrackingService } from '../../lib/gpsTracking';
import { ClockOutModal } from '../Shared/ClockOutModal';
import { offlineSupabaseInsert, offlineSupabaseUpdate, offlineSupabaseQuery } from '../../lib/offlineSupport';
import { updateClockEntryAddress } from '../../lib/reverseGeocode';
import { getOrganizationTimezone, formatDateInTimezone, formatTimeInTimezone } from '../../lib/timezoneUtils';

interface TimeClockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (tab: string, params?: Record<string, string>) => void;
}

interface DailyClockEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  status: string;
  total_hours?: number;
}

interface ActiveBreak {
  id: string;
  break_start: string;
  break_type: string;
}

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  project: {
    name: string;
    customer_name: string;
  };
}

interface InternalSession {
  id: string;
  session_type: 'shop_time' | 'training';
  title: string;
  session_date: string;
  status: string;
  predetermined_hours: number | null;
}

type ActivePanel = 'none' | 'job' | 'shop_time' | 'training' | 'break';

export function TimeClockModal({ isOpen, onClose, onNavigate }: TimeClockModalProps) {
  const { profile } = useAuth();
  const toast = useToast();

  const [todayEntry, setTodayEntry] = useState<DailyClockEntry | null>(null);
  const [activeBreak, setActiveBreak] = useState<ActiveBreak | null>(null);
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [checkingPermission, setCheckingPermission] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [orgTimezone, setOrgTimezone] = useState('America/Chicago');

  const [activePanel, setActivePanel] = useState<ActivePanel>('none');
  const [assignedJobs, setAssignedJobs] = useState<WorkOrder[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [startingJobId, setStartingJobId] = useState<string | null>(null);

  const [approvedSessions, setApprovedSessions] = useState<InternalSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionRequestType, setSessionRequestType] = useState<'shop_time' | 'training'>('shop_time');
  const [sessionDescription, setSessionDescription] = useState('');
  const [sessionHours, setSessionHours] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTodaysClock();
      checkLocationPermission();
      gpsTrackingService.startPreWarming();
      setActivePanel('none');

      const timer = setInterval(() => setCurrentTime(new Date()), 1000);
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        clearInterval(timer);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        gpsTrackingService.stopPreWarming();
      };
    }
  }, [isOpen, profile]);

  useEffect(() => {
    if (!profile || !isOpen) return;
    const channel = supabase
      .channel('time-clock-modal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_clock_entries', filter: `technician_id=eq.${profile.id}` }, loadTodaysClock)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_clock_breaks' }, loadTodaysClock)
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [profile, isOpen]);

  async function checkLocationPermission() {
    setCheckingPermission(true);
    const state = await gpsTrackingService.getPermissionState();
    setLocationPermission(state);
    setCheckingPermission(false);
  }

  async function loadTodaysClock() {
    if (!profile) return;
    try {
      const tz = await getOrganizationTimezone();
      setOrgTimezone(tz);
      const today = formatDateInTimezone(new Date().toISOString(), tz, 'yyyy-MM-dd');

      const { data: entries } = await offlineSupabaseQuery<DailyClockEntry>(
        'daily_clock_entries',
        async () => supabase.from('daily_clock_entries').select('*').eq('technician_id', profile.id).eq('entry_date', today).order('clock_in', { ascending: false }).limit(1)
      );

      const entryData = entries && entries.length > 0 ? entries[0] : null;
      setTodayEntry(entryData);

      if (entryData) {
        const { data: breaks } = await offlineSupabaseQuery<ActiveBreak>(
          'daily_clock_breaks',
          async () => supabase.from('daily_clock_breaks').select('*').eq('daily_clock_entry_id', entryData.id).is('break_end', null)
        );
        setActiveBreak(breaks && breaks.length > 0 ? breaks[0] : null);
      } else {
        setActiveBreak(null);
      }
    } catch (error) {
      console.error('Error loading clock data:', error);
    }
  }

  async function loadAssignedJobs() {
    if (!profile) return;
    setLoadingJobs(true);
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          id, work_order_number, title, status,
          project:projects!work_orders_project_id_fkey(name, customer_name)
        `)
        .eq('assigned_to', profile.id)
        .in('status', ['assigned', 'in_progress', 'pending'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssignedJobs((data || []) as WorkOrder[]);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoadingJobs(false);
    }
  }

  async function loadApprovedSessions(type: 'shop_time' | 'training') {
    if (!profile) return;
    setLoadingSessions(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('internal_time_sessions')
        .select('id, session_type, title, session_date, status, predetermined_hours')
        .eq('assigned_to', profile.id)
        .eq('session_type', type)
        .eq('status', 'scheduled')
        .gte('session_date', today)
        .order('session_date', { ascending: true })
        .limit(5);

      if (error) throw error;
      setApprovedSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoadingSessions(false);
    }
  }

  function handlePanelToggle(panel: ActivePanel) {
    if (activePanel === panel) {
      setActivePanel('none');
      return;
    }
    setActivePanel(panel);
    setRequestSubmitted(false);
    setSessionDescription('');
    setSessionHours('');

    if (panel === 'job') loadAssignedJobs();
    if (panel === 'shop_time') {
      setSessionRequestType('shop_time');
      loadApprovedSessions('shop_time');
    }
    if (panel === 'training') {
      setSessionRequestType('training');
      loadApprovedSessions('training');
    }
  }

  async function handleClockIn() {
    if (!profile) return;
    const entryId = await performClockIn();
    if (entryId && navigator.geolocation) {
      gpsTrackingService.captureLocationForClockEvent(false).then(async (gpsResult) => {
        try {
          const { data: scoreData } = await supabase.rpc('calculate_gps_quality_score', {
            p_accuracy: gpsResult.accuracy, p_method: gpsResult.method,
            p_duration_ms: gpsResult.duration_ms, p_refined: false, p_original_accuracy: null
          });
          await supabase.from('daily_clock_entries').update({
            clock_in_latitude: gpsResult.latitude, clock_in_longitude: gpsResult.longitude,
            clock_in_gps_accuracy: gpsResult.accuracy, clock_in_gps_capture_method: gpsResult.method,
            clock_in_gps_duration_ms: gpsResult.duration_ms, clock_in_gps_attempted_at: gpsResult.attempted_at,
            clock_in_gps_captured_at: gpsResult.captured_at, clock_in_gps_quality_score: scoreData || 0,
          }).eq('id', entryId);
          setLocationPermission('granted');
          localStorage.removeItem('gps_permission_declined');
          if (gpsResult.latitude && gpsResult.longitude) {
            updateClockEntryAddress(entryId, gpsResult.latitude, gpsResult.longitude, false).catch(() => {});
          }
          if (gpsResult.accuracy && gpsResult.accuracy > 50) {
            gpsTrackingService.startPostCaptureRefinement(entryId, false);
          }
        } catch { }
      }).catch((error) => {
        if (error.code === 1) { localStorage.setItem('gps_permission_declined', 'true'); setLocationPermission('denied'); }
      });
    }
  }

  async function performClockIn(): Promise<string | null> {
    if (!profile) return null;
    try {
      const now = new Date();
      const orgTz = await getOrganizationTimezone();
      const today = formatDateInTimezone(now.toISOString(), orgTz, 'yyyy-MM-dd');

      const { data: activeEntries, error: checkError } = await supabase
        .from('daily_clock_entries').select('*').eq('technician_id', profile.id).eq('entry_date', today).is('clock_out', null);
      if (checkError) throw checkError;
      if (activeEntries && activeEntries.length > 0) {
        toast.warning('Please clock out before clocking in again.', 'Already clocked in');
        await loadTodaysClock();
        return null;
      }

      const entryId = crypto.randomUUID();
      const clockInData = {
        id: entryId, technician_id: profile.id, entry_date: today,
        clock_in: now.toISOString(), status: 'clocked_in',
        office_id: profile.primary_office_id, offline_entry: !navigator.onLine
      };

      const { data, error } = await offlineSupabaseInsert<any>('daily_clock_entries', clockInData);
      if (error) throw error;

      const insertedEntry = Array.isArray(data) ? data[0] : data;
      if (navigator.geolocation && navigator.onLine) {
        gpsTrackingService.startTracking(profile.id, insertedEntry?.id || entryId);
      }

      await loadTodaysClock();
      await checkLocationPermission();
      if (!navigator.onLine) toast.info('Clock-in saved locally and will sync when you\'re back online.', 'You are offline');
      return entryId;
    } catch (error: any) {
      console.error('Error clocking in:', error);
      if (error.code === '23505') toast.warning('You have already clocked in today');
      else toast.error('Failed to clock in: ' + error.message);
      return null;
    }
  }

  async function handleStartJob(jobId: string) {
    if (!profile) return;
    setStartingJobId(jobId);
    try {
      const { error: woError } = await supabase.from('work_orders').update({ status: 'in_progress' }).eq('id', jobId);
      if (woError) throw woError;

      const now = new Date();
      const entryData: any = {
        technician_id: profile.id, work_order_id: jobId,
        entry_date: now.toISOString().split('T')[0], clock_in: now.toISOString(),
        clock_out: null, total_hours: 0, break_minutes: 0, status: 'draft',
      };

      const { data: insertedEntry, error: timeError } = await supabase.from('time_entries').insert(entryData).select().single();
      if (timeError) throw timeError;

      await gpsTrackingService.startTracking(profile.id, undefined, jobId);

      if (insertedEntry && navigator.geolocation) {
        gpsTrackingService.captureLocationForClockEvent(false).then(async (gpsResult) => {
          try {
            const { data: scoreData } = await supabase.rpc('calculate_gps_quality_score', {
              p_accuracy: gpsResult.accuracy, p_method: gpsResult.method,
              p_duration_ms: gpsResult.duration_ms, p_refined: false, p_original_accuracy: null
            });
            await supabase.from('time_entries').update({
              clock_in_latitude: gpsResult.latitude, clock_in_longitude: gpsResult.longitude,
              clock_in_gps_accuracy: gpsResult.accuracy, clock_in_gps_capture_method: gpsResult.method,
              clock_in_gps_duration_ms: gpsResult.duration_ms, clock_in_gps_attempted_at: gpsResult.attempted_at,
              clock_in_gps_captured_at: gpsResult.captured_at, clock_in_gps_quality_score: scoreData || 0,
            }).eq('id', insertedEntry.id);
            if (gpsResult.latitude && gpsResult.longitude) {
              updateClockEntryAddress(insertedEntry.id, gpsResult.latitude, gpsResult.longitude, false, 'time_entries').catch(() => {});
            }
            if (gpsResult.accuracy && gpsResult.accuracy > 50) {
              gpsTrackingService.startPostCaptureRefinement(insertedEntry.id, false, 'time_entries');
            }
          } catch { }
        }).catch(() => {});
      }

      toast.success('Job started — opening work order');
      onClose();
      if (onNavigate) {
        onNavigate('work_orders', { workOrderId: jobId });
      }
    } catch (error: any) {
      console.error('Error starting job:', error);
      toast.error('Failed to start job: ' + error.message);
    } finally {
      setStartingJobId(null);
    }
  }

  async function handleSubmitSessionRequest() {
    if (!profile) return;
    if (!sessionDescription.trim()) { toast.warning('Please describe what you need this time for'); return; }
    if (!sessionHours) { toast.warning('Please select a duration'); return; }

    setSubmittingRequest(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: insertedSession, error } = await supabase.from('internal_time_sessions').insert({
        session_type: sessionRequestType,
        title: sessionRequestType === 'shop_time' ? 'Shop Time Request' : 'Training Request',
        description: sessionDescription.trim(),
        session_date: today,
        assigned_to: profile.id,
        requested_by: profile.id,
        request_reason: sessionDescription.trim(),
        predetermined_hours: parseFloat(sessionHours),
        status: 'pending_approval',
        created_by: profile.id,
      }).select('id').maybeSingle();
      if (error) throw error;
      setRequestSubmitted(true);
      toast.success('Request submitted — a manager will review it');

      // Fire-and-forget: email notification to approvers
      if (insertedSession?.id) {
        supabase.functions.invoke('send-time-request-notification', {
          body: { sessionId: insertedSession.id, direction: 'to_approvers' },
        }).catch(() => {/* non-critical */});
      }
    } catch (error: any) {
      console.error('Error submitting request:', error);
      toast.error('Failed to submit request: ' + error.message);
    } finally {
      setSubmittingRequest(false);
    }
  }

  function handleClockOut() {
    if (!todayEntry || !profile) return;
    if (activeBreak) { toast.warning('Please end your break before clocking out'); return; }
    setShowClockOutModal(true);
  }

  async function handleClockOutSuccess() {
    gpsTrackingService.stopTracking();
    gpsTrackingService.stopPostCaptureRefinement();
    await loadTodaysClock();
    setShowClockOutModal(false);
  }

  async function handleStartBreak(breakType: 'lunch' | 'personal' | 'other') {
    if (!todayEntry) return;
    try {
      const { error } = await offlineSupabaseInsert('daily_clock_breaks', {
        id: crypto.randomUUID(), daily_clock_entry_id: todayEntry.id,
        break_start: new Date().toISOString(), break_type: breakType, offline_entry: !navigator.onLine
      });
      if (error) throw error;
      setActivePanel('none');
      await loadTodaysClock();
      if (!navigator.onLine) toast.info('Break saved locally. Will sync when you\'re back online.', 'Break started offline');
    } catch (error) {
      console.error('Error starting break:', error);
      toast.error('Failed to start break');
    }
  }

  async function handleEndBreak() {
    if (!activeBreak) return;
    try {
      const { error } = await offlineSupabaseUpdate('daily_clock_breaks', { break_end: new Date().toISOString() }, activeBreak.id);
      if (error) throw error;
      await loadTodaysClock();
      if (!navigator.onLine) toast.info('Break end saved locally. Will sync when you\'re back online.', 'Offline');
    } catch (error) {
      console.error('Error ending break:', error);
      toast.error('Failed to end break');
    }
  }

  const getElapsedTime = (startTime: string) => {
    const diffMs = currentTime.getTime() - new Date(startTime).getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getBreakElapsedMinutes = () => {
    if (!activeBreak) return 0;
    return Math.floor((currentTime.getTime() - new Date(activeBreak.break_start).getTime()) / 60000);
  };

  const isClockedIn = todayEntry && !todayEntry.clock_out;
  const isClockedOut = todayEntry && todayEntry.clock_out;

  const gpsStatusColor =
    locationPermission === 'granted' ? 'bg-green-500' :
    locationPermission === 'denied' ? 'bg-red-400' :
    'bg-yellow-400';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className={`rounded-t-2xl px-6 pt-5 pb-4 ${
          isClockedOut ? 'bg-gray-50' :
          isClockedIn ? 'bg-gradient-to-br from-green-600 to-green-700' :
          'bg-gradient-to-br from-slate-800 to-slate-900'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className={`w-5 h-5 ${isClockedIn && !isClockedOut ? 'text-white' : 'text-gray-500'}`} />
              <span className={`font-semibold text-sm ${isClockedIn && !isClockedOut ? 'text-white/80' : 'text-gray-500'}`}>
                Time Clock
              </span>
            </div>
            <div className="flex items-center gap-3">
              {!checkingPermission && (
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${gpsStatusColor} ${locationPermission === 'granted' ? 'animate-pulse' : ''}`} />
                  <span className={`text-xs ${isClockedIn && !isClockedOut ? 'text-white/60' : 'text-gray-400'}`}>GPS</span>
                </div>
              )}
              <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isClockedIn && !isClockedOut ? 'hover:bg-white/20 text-white' : 'hover:bg-gray-100 text-gray-500'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className={`text-4xl font-bold tracking-tight ${isClockedIn && !isClockedOut ? 'text-white' : 'text-gray-900'}`}>
            {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className={`text-sm mt-1 ${isClockedIn && !isClockedOut ? 'text-white/70' : 'text-gray-500'}`}>
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>

          {isClockedIn && (
            <div className="mt-3 flex items-center gap-3">
              <div className="bg-white/20 rounded-lg px-3 py-1.5 text-white text-sm font-medium">
                {getElapsedTime(todayEntry.clock_in)} elapsed
              </div>
              <div className="text-white/60 text-xs">
                Started {formatTimeInTimezone(todayEntry.clock_in, orgTimezone, 'h:mm aa')}
              </div>
              {todayEntry.break_minutes > 0 && (
                <div className="text-white/50 text-xs">
                  {todayEntry.break_minutes}m break
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 space-y-4">
          {isOffline && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-orange-600 flex-shrink-0" />
              <p className="text-sm text-orange-800">Offline — actions will sync when you reconnect.</p>
            </div>
          )}

          {/* NOT CLOCKED IN */}
          {!todayEntry && (
            <button
              onClick={handleClockIn}
              disabled={checkingPermission}
              className="w-full bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-xl py-5 text-xl font-bold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
            >
              <Play className="w-6 h-6" />
              Start Your Day
            </button>
          )}

          {/* CLOCKED IN */}
          {isClockedIn && (
            <>
              {/* ACTIVE BREAK STATE */}
              {activeBreak ? (
                <div className="space-y-3">
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <Coffee className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <div className="font-bold text-amber-900 capitalize">{activeBreak.break_type} Break</div>
                        <div className="text-sm text-amber-700">{getBreakElapsedMinutes()} minutes elapsed</div>
                      </div>
                    </div>
                    <button
                      onClick={handleEndBreak}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-lg py-3 font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      <Pause className="w-4 h-4" />
                      End Break
                    </button>
                  </div>
                  <button
                    onClick={handleClockOut}
                    disabled
                    className="w-full bg-gray-200 text-gray-400 cursor-not-allowed rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2"
                    title="End break first"
                  >
                    <StopCircle className="w-5 h-5" />
                    Clock Out for the Day
                  </button>
                  <p className="text-xs text-center text-gray-400">End your break before clocking out</p>
                </div>
              ) : (
                <>
                  {/* ACTION GRID */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Clock Into a Job */}
                    <ActionCard
                      icon={<Briefcase className="w-5 h-5 text-blue-600" />}
                      bgColor="bg-blue-50"
                      borderColor={activePanel === 'job' ? 'border-blue-500' : 'border-blue-200'}
                      label="Clock Into Job"
                      sublabel="Start a work order"
                      active={activePanel === 'job'}
                      onClick={() => handlePanelToggle('job')}
                    />
                    {/* Shop Time */}
                    <ActionCard
                      icon={<Wrench className="w-5 h-5 text-slate-600" />}
                      bgColor="bg-slate-50"
                      borderColor={activePanel === 'shop_time' ? 'border-slate-500' : 'border-slate-200'}
                      label="Shop Time"
                      sublabel="Request shop work"
                      active={activePanel === 'shop_time'}
                      onClick={() => handlePanelToggle('shop_time')}
                    />
                    {/* Training */}
                    <ActionCard
                      icon={<GraduationCap className="w-5 h-5 text-teal-600" />}
                      bgColor="bg-teal-50"
                      borderColor={activePanel === 'training' ? 'border-teal-500' : 'border-teal-200'}
                      label="Training"
                      sublabel="Request training time"
                      active={activePanel === 'training'}
                      onClick={() => handlePanelToggle('training')}
                    />
                    {/* Take a Break */}
                    <ActionCard
                      icon={<Coffee className="w-5 h-5 text-amber-600" />}
                      bgColor="bg-amber-50"
                      borderColor={activePanel === 'break' ? 'border-amber-500' : 'border-amber-200'}
                      label="Take a Break"
                      sublabel="Lunch, personal, other"
                      active={activePanel === 'break'}
                      onClick={() => handlePanelToggle('break')}
                    />
                  </div>

                  {/* INLINE PANELS */}

                  {/* Job Panel */}
                  {activePanel === 'job' && (
                    <div className="border border-blue-200 rounded-xl overflow-hidden">
                      <div className="bg-blue-50 px-4 py-2.5 flex items-center justify-between border-b border-blue-200">
                        <span className="text-sm font-semibold text-blue-800">Your Assigned Jobs</span>
                        {loadingJobs && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                      </div>
                      <div className="divide-y divide-gray-100">
                        {loadingJobs ? (
                          <div className="p-4 text-center text-sm text-gray-400">Loading jobs...</div>
                        ) : assignedJobs.length === 0 ? (
                          <div className="p-4 text-center">
                            <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">No jobs assigned</p>
                            <button
                              onClick={() => { onClose(); if (onNavigate) onNavigate('tech_center'); }}
                              className="mt-2 text-xs text-blue-600 hover:underline"
                            >
                              Visit your Work Center
                            </button>
                          </div>
                        ) : (
                          assignedJobs.map(job => (
                            <div key={job.id} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono text-gray-400">{job.work_order_number}</span>
                                  {job.status === 'in_progress' && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Active</span>
                                  )}
                                </div>
                                <div className="text-sm font-medium text-gray-900 truncate">{job.title}</div>
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <MapPin className="w-3 h-3" />
                                  <span className="truncate">{job.project?.customer_name || job.project?.name || 'No customer'}</span>
                                </div>
                              </div>
                              {job.status === 'in_progress' ? (
                                <button
                                  onClick={() => { onClose(); if (onNavigate) onNavigate('work_orders', { workOrderId: job.id }); }}
                                  className="flex-shrink-0 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                                >
                                  Open
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartJob(job.id)}
                                  disabled={!!startingJobId}
                                  className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                                >
                                  {startingJobId === job.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                  Start
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Shop Time / Training Request Panel */}
                  {(activePanel === 'shop_time' || activePanel === 'training') && (
                    <div className={`border rounded-xl overflow-hidden ${activePanel === 'training' ? 'border-teal-200' : 'border-slate-200'}`}>
                      <div className={`px-4 py-2.5 border-b ${activePanel === 'training' ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200'}`}>
                        <span className={`text-sm font-semibold ${activePanel === 'training' ? 'text-teal-800' : 'text-slate-800'}`}>
                          {activePanel === 'training' ? 'Request Training Time' : 'Request Shop Time'}
                        </span>
                      </div>

                      {requestSubmitted ? (
                        <div className="p-5 text-center">
                          <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                          <p className="text-sm font-semibold text-gray-900">Request Submitted</p>
                          <p className="text-xs text-gray-500 mt-1">A manager will review and approve your time entry before it counts toward your pay.</p>
                        </div>
                      ) : (
                        <div className="p-4 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">What do you need this time for?</label>
                            <textarea
                              value={sessionDescription}
                              onChange={e => setSessionDescription(e.target.value)}
                              rows={2}
                              placeholder={activePanel === 'shop_time' ? 'e.g. Cleaning the shop, organizing inventory...' : 'e.g. Safety certification video, product training...'}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Approximate duration</label>
                            <div className="flex gap-2 flex-wrap">
                              {['0.5', '1', '2', '4'].map(h => (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => setSessionHours(h)}
                                  className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                                    sessionHours === h
                                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                  }`}
                                >
                                  {h === '0.5' ? '30 min' : `${h}h`}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700">
                              A manager or admin must approve this request before it can be logged to your timesheet.
                            </p>
                          </div>
                          <button
                            onClick={handleSubmitSessionRequest}
                            disabled={submittingRequest || !sessionDescription.trim() || !sessionHours}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            {submittingRequest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {submittingRequest ? 'Submitting...' : 'Submit Request'}
                          </button>

                          {/* Approved sessions for today */}
                          {approvedSessions.length > 0 && (
                            <div className="pt-1 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-500 mb-2">Already scheduled for you:</p>
                              {approvedSessions.map(s => (
                                <div key={s.id} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-1 flex items-center justify-between">
                                  <span>{s.title}</span>
                                  {s.predetermined_hours && <span className="text-gray-400">{s.predetermined_hours}h</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Break Panel */}
                  {activePanel === 'break' && (
                    <div className="border border-amber-200 rounded-xl overflow-hidden">
                      <div className="bg-amber-50 px-4 py-2.5 border-b border-amber-200">
                        <span className="text-sm font-semibold text-amber-800">Start a Break</span>
                      </div>
                      <div className="flex p-3 gap-2">
                        <BreakButton icon={<Coffee className="w-4 h-4" />} label="Lunch" color="orange" onClick={() => handleStartBreak('lunch')} />
                        <BreakButton icon={<User className="w-4 h-4" />} label="Personal" color="blue" onClick={() => handleStartBreak('personal')} />
                        <BreakButton icon={<Pause className="w-4 h-4" />} label="Other" color="gray" onClick={() => handleStartBreak('other')} />
                      </div>
                    </div>
                  )}

                  {/* Clock Out */}
                  <button
                    onClick={handleClockOut}
                    className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl py-3.5 font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                  >
                    <StopCircle className="w-5 h-5" />
                    Clock Out for the Day
                  </button>
                </>
              )}
            </>
          )}

          {/* CLOCKED OUT */}
          {isClockedOut && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-8 h-8 text-gray-400" />
                </div>
                <div className="text-lg font-bold text-gray-900 mb-1">Day Complete</div>
                <div className="text-3xl font-bold text-gray-700 mb-2">
                  {todayEntry.total_hours?.toFixed(2) || '0.00'} hrs
                </div>
                <div className="text-sm text-gray-500">
                  {formatTimeInTimezone(todayEntry.clock_in, orgTimezone, 'h:mm aa')}
                  {' — '}
                  {formatTimeInTimezone(todayEntry.clock_out!, orgTimezone, 'h:mm aa')}
                </div>
                {todayEntry.break_minutes > 0 && (
                  <div className="text-xs text-gray-400 mt-1">{todayEntry.break_minutes} min break deducted</div>
                )}
              </div>

              <button
                onClick={handleClockIn}
                disabled={checkingPermission}
                className="w-full bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-xl py-4 text-lg font-bold transition-all shadow-lg flex items-center justify-center gap-3"
              >
                <Play className="w-5 h-5" />
                Clock In Again
              </button>
            </div>
          )}
        </div>
      </div>

      {showClockOutModal && todayEntry && profile && (
        <ClockOutModal
          onClose={() => setShowClockOutModal(false)}
          entryId={todayEntry.id}
          technicianId={profile.id}
          type="daily"
          onSuccess={handleClockOutSuccess}
        />
      )}
    </div>
  );
}

interface ActionCardProps {
  icon: React.ReactNode;
  bgColor: string;
  borderColor: string;
  label: string;
  sublabel: string;
  active: boolean;
  onClick: () => void;
}

function ActionCard({ icon, bgColor, borderColor, label, sublabel, active, onClick }: ActionCardProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-2 p-3.5 rounded-xl border-2 transition-all text-left hover:shadow-sm ${bgColor} ${borderColor} ${active ? 'shadow-sm' : ''}`}
    >
      <div className={`p-1.5 rounded-lg bg-white/70`}>{icon}</div>
      <div>
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        <div className="text-xs text-gray-500 leading-tight">{sublabel}</div>
      </div>
    </button>
  );
}

interface BreakButtonProps {
  icon: React.ReactNode;
  label: string;
  color: 'orange' | 'blue' | 'gray';
  onClick: () => void;
}

function BreakButton({ icon, label, color, onClick }: BreakButtonProps) {
  const colorMap = {
    orange: 'border-orange-200 hover:border-orange-400 text-orange-700 hover:bg-orange-50',
    blue: 'border-blue-200 hover:border-blue-400 text-blue-700 hover:bg-blue-50',
    gray: 'border-gray-200 hover:border-gray-400 text-gray-700 hover:bg-gray-50',
  };
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 border rounded-lg transition-all text-sm font-medium ${colorMap[color]}`}
    >
      {icon}
      {label}
    </button>
  );
}
