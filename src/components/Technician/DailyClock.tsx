import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Clock, Play, Pause, StopCircle, Coffee, Award, AlertCircle, User, WifiOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { gpsTrackingService } from '../../lib/gpsTracking';
import { updateClockEntryAddress } from '../../lib/reverseGeocode';
import { ClockOutModal } from '../Shared/ClockOutModal';
import { offlineSupabaseInsert, offlineSupabaseUpdate, offlineSupabaseQuery } from '../../lib/offlineSupport';
import { getOrganizationTimezone, formatDateInTimezone, formatTimeInTimezone } from '../../lib/timezoneUtils';

interface DailyClockEntry {
  id: string;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  break_minutes: number;
  status: string;
  notes: string | null;
}

interface Break {
  id: string;
  break_start: string;
  break_end: string | null;
  break_duration_minutes: number;
  break_type: string;
}

interface RewardEvent {
  id: string;
  event_type: string;
  points_awarded: number;
  minutes_delta: number;
  created_at: string;
}

export function DailyClock() {
  const { profile } = useAuth();
  const [todayEntry, setTodayEntry] = useState<DailyClockEntry | null>(null);
  const [activeBreak, setActiveBreak] = useState<Break | null>(null);
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [rewardEvent, setRewardEvent] = useState<RewardEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showBreakMenu, setShowBreakMenu] = useState(false);
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [orgTimezone, setOrgTimezone] = useState('America/Chicago');
  const breakMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getOrganizationTimezone().then(tz => setOrgTimezone(tz));

    if (profile?.requires_daily_clock) {
      loadTodaysClock();
    }

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Monitor online/offline status
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check if page is served over HTTPS (required for geolocation on iOS)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      console.error('Geolocation requires HTTPS on iOS. Current protocol:', window.location.protocol);
    }

    // Start GPS pre-warming when component mounts (only if not clocked in)
    if (!todayEntry && navigator.geolocation) {
      gpsTrackingService.startPreWarming();
    }

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      gpsTrackingService.stopPreWarming();
    };
  }, [profile, todayEntry]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (breakMenuRef.current && !breakMenuRef.current.contains(event.target as Node)) {
        setShowBreakMenu(false);
      }
    }

    if (showBreakMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showBreakMenu]);

  useEffect(() => {
    if (!todayEntry) return;

    const channel = supabase
      .channel(`daily-clock-${todayEntry.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_clock_entries',
        filter: `id=eq.${todayEntry.id}`
      }, () => {
        loadTodaysClock();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_clock_breaks',
        filter: `daily_clock_entry_id=eq.${todayEntry.id}`
      }, () => {
        loadBreaks(todayEntry.id);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [todayEntry?.id]);

  async function loadTodaysClock() {
    if (!profile) return;

    try {
      const tz = await getOrganizationTimezone();
      setOrgTimezone(tz);
      const today = formatDateInTimezone(new Date().toISOString(), tz, 'yyyy-MM-dd');

      // Use offline-capable query
      const { data: entries, error } = await offlineSupabaseQuery<DailyClockEntry>(
        'daily_clock_entries',
        async () => {
          return await supabase
            .from('daily_clock_entries')
            .select('*')
            .eq('technician_id', profile.id)
            .eq('entry_date', today)
            .order('clock_in', { ascending: false });
        }
      );

      if (error) throw error;

      // Prioritize active entry (clock_out is null) over completed entries
      let entry = null;
      if (entries && entries.length > 0) {
        // First, look for any active entry (clock_out is null)
        const activeEntry = entries.find(e => !e.clock_out);
        entry = activeEntry || entries[0]; // Fall back to most recent if all are clocked out
      }

      setTodayEntry(entry);

      if (entry) {
        await loadBreaks(entry.id);
        await loadRewardEvent(entry.id);

        if (entry.status === 'clocked_in' && !entry.clock_out && navigator.onLine) {
          if (!gpsTrackingService.isCurrentlyTracking()) {
            await gpsTrackingService.startTracking(profile.id, entry.id);
          }
        }
      }
    } catch (error) {
      console.error('Error loading daily clock:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadBreaks(entryId: string) {
    try {
      const { data, error } = await offlineSupabaseQuery<Break>(
        'daily_clock_breaks',
        async () => {
          return await supabase
            .from('daily_clock_breaks')
            .select('*')
            .eq('daily_clock_entry_id', entryId)
            .order('break_start', { ascending: false });
        }
      );

      if (error) throw error;

      setBreaks(data || []);
      const active = data?.find(b => !b.break_end);
      setActiveBreak(active || null);
    } catch (error) {
      console.error('Error loading breaks:', error);
    }
  }

  async function loadRewardEvent(entryId: string) {
    try {
      const { data, error } = await supabase
        .from('clock_in_rewards_log')
        .select('*')
        .eq('daily_clock_entry_id', entryId)
        .maybeSingle();

      if (error) throw error;
      setRewardEvent(data);
    } catch (error) {
      console.error('Error loading reward event:', error);
    }
  }

  async function handleClockIn() {
    if (!profile) return;

    // Clock in immediately without waiting for GPS
    const entryId = await performClockIn();

    // Capture GPS location in background (non-blocking)
    if (entryId && navigator.geolocation) {
      gpsTrackingService.captureLocationForClockEvent(false).then(async (gpsResult) => {
        try {
          // Calculate GPS quality score
          const { data: scoreData } = await supabase.rpc('calculate_gps_quality_score', {
            p_accuracy: gpsResult.accuracy,
            p_method: gpsResult.method,
            p_duration_ms: gpsResult.duration_ms,
            p_refined: false,
            p_original_accuracy: null
          });

          // Update the clock entry with GPS metadata
          await supabase
            .from('daily_clock_entries')
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
            .eq('id', entryId);

          // Reverse geocode address if GPS was captured
          if (gpsResult.latitude && gpsResult.longitude) {
            updateClockEntryAddress(entryId, gpsResult.latitude, gpsResult.longitude, false, 'daily_clock_entries').catch(() => {});
          }

          // Start refinement if accuracy is poor (>50m)
          if (gpsResult.accuracy && gpsResult.accuracy > 50) {
            gpsTrackingService.startPostCaptureRefinement(entryId, false, 'daily_clock_entries');
          }
        } catch (error) {
          // Silently fail - GPS metadata is not critical
        }
      }).catch(() => {
        // Silently fail - GPS capture is best-effort only
      });
    }
  }

  async function performClockIn(): Promise<string | null> {
    if (!profile) return null;

    try {
      const now = new Date();
      const orgTz = await getOrganizationTimezone();
      const today = formatDateInTimezone(now.toISOString(), orgTz, 'yyyy-MM-dd');

      // Check for any existing active clock-in entries (where clock_out is NULL)
      const { data: activeEntries, error: checkError } = await supabase
        .from('daily_clock_entries')
        .select('*')
        .eq('technician_id', profile.id)
        .eq('entry_date', today)
        .is('clock_out', null);

      if (checkError) throw checkError;

      // If there's already an active clock-in, prevent creating a duplicate
      if (activeEntries && activeEntries.length > 0) {
        alert('You are already clocked in. Please clock out before clocking in again.');
        await loadTodaysClock(); // Refresh to show the current entry
        return null;
      }

      const entryId = crypto.randomUUID();

      const clockInData = {
        id: entryId,
        technician_id: profile.id,
        entry_date: today,
        clock_in: now.toISOString(),
        status: 'clocked_in',
        office_id: profile.primary_office_id,
        offline_entry: !navigator.onLine
      };

      // Use offline-capable insert
      const { data, error } = await offlineSupabaseInsert<any>(
        'daily_clock_entries',
        clockInData
      );

      if (error) throw error;

      const insertedEntry = Array.isArray(data) ? data[0] : data;

      // Start GPS tracking silently in the background
      if (navigator.geolocation) {
        gpsTrackingService.startTracking(profile.id, insertedEntry.id);
      }

      await loadTodaysClock();

      // Show offline notification
      if (!navigator.onLine) {
        alert('You are offline. Clock-in saved locally and will sync when you\'re back online.');
      }

      return entryId;
    } catch (error: any) {
      console.error('Error clocking in:', error);
      if (error.code === '23505') {
        alert('You have already clocked in today');
      } else {
        alert('Failed to clock in: ' + error.message);
      }
      return null;
    }
  }

  function handleClockOut() {
    if (!todayEntry || !profile) return;

    if (activeBreak) {
      alert('Please end your break before clocking out');
      return;
    }

    setShowClockOutModal(true);
  }

  async function handleClockOutSuccess() {
    gpsTrackingService.stopTracking();
    await loadTodaysClock();
  }

  async function handleStartBreak(breakType: 'lunch' | 'personal' | 'other' = 'lunch') {
    if (!todayEntry) return;

    try {
      const { error } = await offlineSupabaseInsert(
        'daily_clock_breaks',
        {
          id: crypto.randomUUID(),
          daily_clock_entry_id: todayEntry.id,
          break_start: new Date().toISOString(),
          break_type: breakType,
          offline_entry: !navigator.onLine
        }
      );

      if (error) throw error;
      await loadBreaks(todayEntry.id);
      setShowBreakMenu(false);

      if (!navigator.onLine) {
        alert('Break started offline. Will sync when you\'re back online.');
      }
    } catch (error) {
      console.error('Error starting break:', error);
      alert('Failed to start break');
    }
  }

  async function handleEndBreak() {
    if (!activeBreak) return;

    try {
      const { error } = await offlineSupabaseUpdate(
        'daily_clock_breaks',
        {
          break_end: new Date().toISOString()
        },
        activeBreak.id
      );

      if (error) throw error;
      await loadBreaks(todayEntry!.id);

      if (!navigator.onLine) {
        alert('Break ended offline. Will sync when you\'re back online.');
      }
    } catch (error) {
      console.error('Error ending break:', error);
      alert('Failed to end break');
    }
  }

  function getTimeSince(timestamp: string): string {
    const start = new Date(timestamp);
    const diff = currentTime.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  function getRewardColor(eventType: string): string {
    switch (eventType) {
      case 'early':
        return 'text-green-600';
      case 'on_time':
        return 'text-blue-600';
      case 'late':
        return 'text-orange-600';
      case 'very_late':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  }

  function formatMinutesLate(minutes: number): string {
    const absMinutes = Math.abs(minutes);
    if (absMinutes < 60) return `${absMinutes} ${absMinutes === 1 ? 'minute' : 'minutes'}`;
    const hours = Math.floor(absMinutes / 60);
    const mins = absMinutes % 60;
    const hourStr = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    if (mins === 0) return hourStr;
    return `${hourStr} and ${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  }

  function getRewardMessage(eventType: string, points: number, delta: number): string {
    if (eventType === 'early') {
      return `Great! You clocked in ${Math.abs(delta)} minutes early!`;
    } else if (eventType === 'on_time') {
      return 'Perfect timing!';
    } else if (eventType === 'late') {
      return `You clocked in ${formatMinutesLate(delta)} late`;
    } else if (eventType === 'very_late') {
      return `You were ${formatMinutesLate(delta)} late`;
    }
    return '';
  }

  if (!profile?.requires_daily_clock) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
        <Clock className="w-12 h-12 text-blue-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Daily Clock Not Required</h3>
        <p className="text-gray-300">
          Your employment type ({profile?.employment_type}) does not require daily clock-in/out.
          {profile?.employment_type === 'job_time' && ' You only need to clock into specific jobs.'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading clock...</div>
      </div>
    );
  }

  const isClockedIn = todayEntry && !todayEntry.clock_out;
  const isClockedOut = todayEntry && todayEntry.clock_out;

  return (
    <div className="space-y-4">
      {/* Reward Notification */}
      {rewardEvent && (
        <div className={`bg-white border-2 rounded-xl p-4 ${
          rewardEvent.points_awarded > 0 ? 'border-green-300 bg-green-50' : 'border-orange-300 bg-orange-50'
        }`}>
          <div className="flex items-center gap-3">
            <Award className={`w-6 h-6 ${getRewardColor(rewardEvent.event_type)}`} />
            <div className="flex-1">
              <p className="font-semibold text-gray-900">
                {getRewardMessage(rewardEvent.event_type, rewardEvent.points_awarded, rewardEvent.minutes_delta)}
              </p>
              <p className={`text-sm font-medium ${rewardEvent.points_awarded >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {rewardEvent.points_awarded >= 0 ? '+' : ''}{rewardEvent.points_awarded} points
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Clock Card */}
      <div className={`rounded-2xl shadow-xl p-8 text-white transition-all ${
        isClockedOut
          ? 'bg-gradient-to-br from-gray-500 to-gray-600'
          : isClockedIn
          ? 'bg-gradient-to-br from-green-500 to-green-600'
          : 'bg-gradient-to-br from-blue-500 to-blue-600'
      }`}>
        {/* Status Badge */}
        <div className="flex justify-center mb-4">
          <div className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 ${
            isClockedOut
              ? 'bg-white/30'
              : isClockedIn
              ? 'bg-white/30'
              : 'bg-white/20'
          }`}>
            {isClockedOut ? (
              <>
                <StopCircle className="w-4 h-4" />
                CLOCKED OUT
              </>
            ) : isClockedIn ? (
              <>
                <Clock className="w-4 h-4" />
                CLOCKED IN
              </>
            ) : (
              <>
                <Clock className="w-4 h-4" />
                READY TO CLOCK IN
              </>
            )}
          </div>
        </div>

        <div className="text-center mb-6">
          <div className="text-6xl font-bold mb-2">
            {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-xl opacity-90">
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>



        {isOffline && (
          <div className="bg-orange-500 text-white rounded-xl p-4 mb-4 text-center">
            <WifiOff className="w-6 h-6 mx-auto mb-2" />
            <p className="font-semibold mb-1">Offline Mode</p>
            <p className="text-sm opacity-90">
              You can still clock in/out. Your data will be saved locally and synced when you reconnect.
            </p>
          </div>
        )}

        {!todayEntry && (
          <>
            <button
              onClick={handleClockIn}
              className="w-full bg-white text-blue-600 rounded-xl py-6 text-2xl font-bold hover:bg-blue-50 transition-colors shadow-lg flex items-center justify-center gap-3"
            >
              <Play className="w-8 h-8" />
              CLOCK IN
            </button>
          </>
        )}

        {isClockedIn && (
          <div className="space-y-4">
            <div className="bg-white/20 rounded-xl p-4 backdrop-blur-sm">
              <div className="text-center">
                <div className="text-sm opacity-90 mb-1">Clocked In</div>
                <div className="text-4xl font-bold mb-1">{getTimeSince(todayEntry.clock_in)}</div>
                <div className="text-sm opacity-75">
                  Started at {formatTimeInTimezone(todayEntry.clock_in, orgTimezone, 'h:mm aa')}
                </div>
                {todayEntry.break_minutes > 0 && (
                  <div className="text-sm opacity-75 mt-1">
                    Break time: {todayEntry.break_minutes} minutes
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {!activeBreak ? (
                <div className="relative" ref={breakMenuRef}>
                  <button
                    onClick={() => setShowBreakMenu(!showBreakMenu)}
                    className="w-full bg-white/20 hover:bg-white/30 rounded-xl py-4 font-semibold backdrop-blur-sm flex items-center justify-center gap-2"
                  >
                    <Coffee className="w-5 h-5" />
                    Start Break
                  </button>

                  {showBreakMenu && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl overflow-hidden z-10 border-2 border-blue-200">
                      <button
                        onClick={() => handleStartBreak('lunch')}
                        className="w-full px-4 py-3 text-left text-gray-900 hover:bg-blue-50 transition-colors flex items-center gap-3 border-b border-gray-200"
                      >
                        <Coffee className="w-5 h-5 text-orange-500" />
                        <div>
                          <div className="font-semibold">Lunch Break</div>
                          <div className="text-xs text-gray-500">Meal time</div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleStartBreak('personal')}
                        className="w-full px-4 py-3 text-left text-gray-900 hover:bg-blue-50 transition-colors flex items-center gap-3 border-b border-gray-200"
                      >
                        <User className="w-5 h-5 text-blue-500" />
                        <div>
                          <div className="font-semibold">Personal Break</div>
                          <div className="text-xs text-gray-500">Restroom, phone call, etc.</div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleStartBreak('other')}
                        className="w-full px-4 py-3 text-left text-gray-900 hover:bg-blue-50 transition-colors flex items-center gap-3"
                      >
                        <Pause className="w-5 h-5 text-gray-500" />
                        <div>
                          <div className="font-semibold">Other Break</div>
                          <div className="text-xs text-gray-500">Other reason</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleEndBreak}
                  className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 rounded-xl py-4 font-semibold flex items-center justify-center gap-2 shadow-lg"
                >
                  <Pause className="w-5 h-5" />
                  <div className="flex flex-col items-center">
                    <span>End Break</span>
                    <span className="text-xs font-normal">
                      {Math.floor((currentTime.getTime() - new Date(activeBreak.break_start).getTime()) / 60000)}m elapsed
                    </span>
                  </div>
                </button>
              )}

              <button
                onClick={handleClockOut}
                disabled={!!activeBreak}
                className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-xl py-4 font-semibold flex items-center justify-center gap-2"
              >
                <StopCircle className="w-5 h-5" />
                Clock Out
              </button>
            </div>

            {activeBreak && (
              <div className="bg-yellow-400/20 border border-yellow-400/50 rounded-xl p-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-200" />
                <span className="text-sm">You are currently on break. End break before clocking out.</span>
              </div>
            )}
          </div>
        )}

        {isClockedOut && (
          <div className="bg-white/20 rounded-xl p-6 backdrop-blur-sm text-center">
            <CheckCircleIcon className="w-16 h-16 mx-auto mb-3 text-green-300" />
            <div className="text-2xl font-bold mb-2">Clocked Out</div>
            <div className="text-lg mb-1">Total Hours: {todayEntry.total_hours.toFixed(2)}</div>
            <div className="text-sm opacity-75">
              {formatTimeInTimezone(todayEntry.clock_in, orgTimezone, 'h:mm aa')} -
              {' '}{formatTimeInTimezone(todayEntry.clock_out!, orgTimezone, 'h:mm aa')}
            </div>
            {todayEntry.break_minutes > 0 && (
              <div className="text-sm opacity-75 mt-1">
                (Breaks: {todayEntry.break_minutes} minutes)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Break History */}
      {breaks.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Coffee className="w-5 h-5 text-orange-500" />
            Today's Breaks
          </h3>
          <div className="space-y-2">
            {breaks.map(brk => {
              const getBreakIcon = () => {
                switch (brk.break_type) {
                  case 'lunch':
                    return <Coffee className="w-5 h-5 text-orange-500" />;
                  case 'personal':
                    return <User className="w-5 h-5 text-blue-500" />;
                  case 'other':
                    return <Pause className="w-5 h-5 text-gray-500" />;
                  default:
                    return <Coffee className="w-5 h-5 text-gray-500" />;
                }
              };

              const getBreakStatus = () => {
                if (!brk.break_end) {
                  return <span className="font-semibold text-yellow-600 flex items-center gap-1">
                    <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                    Active
                  </span>;
                }
                return <span className="font-semibold text-gray-700">{brk.break_duration_minutes} min</span>;
              };

              return (
                <div key={brk.id} className={`flex items-center justify-between text-sm p-3 rounded-lg border ${
                  brk.break_end ? 'bg-gray-50 border-gray-200' : 'bg-yellow-50 border-yellow-300'
                }`}>
                  <div className="flex items-center gap-3">
                    {getBreakIcon()}
                    <div>
                      <div className="font-semibold text-gray-900 capitalize">{brk.break_type} Break</div>
                      <div className="text-xs text-gray-500">
                        {formatTimeInTimezone(brk.break_start, orgTimezone, 'h:mm aa')}
                        {brk.break_end && ` - ${formatTimeInTimezone(brk.break_end, orgTimezone, 'h:mm aa')}`}
                      </div>
                    </div>
                  </div>
                  {getBreakStatus()}
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center text-sm">
            <span className="text-gray-600 font-medium">Total Break Time:</span>
            <span className="font-bold text-gray-900">{todayEntry?.break_minutes || 0} minutes</span>
          </div>
        </div>
      )}

      {/* Clock Out Modal */}
      {showClockOutModal && todayEntry && profile && (
        <ClockOutModal
          type="daily"
          entryId={todayEntry.id}
          technicianId={profile.id}
          onClose={() => setShowClockOutModal(false)}
          onSuccess={handleClockOutSuccess}
        />
      )}
    </div>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
