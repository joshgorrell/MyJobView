import { InternalTimeCard } from '../components/InternalTimeCard';
import { assertNoInternalTimer } from '../services/InternalTime';
import { saveNativeClockGps } from '../services/ClockEventGps';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { openMJV } from '../services/OpenMJV';
import { getEmployeeTimeContext, workDate } from '../services/EmployeeTimeContext';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import { locationTrackingService } from '../services/LocationTrackingService';
import { offlineStorage } from '../services/OfflineStorage';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { Colors } from '../theme/colors';
import { Typography, Spacing, Radius, Shadows } from '../theme/styles';
import { Card } from '../components/UI';
import { ScreenContainer } from '../components/ScreenContainer';

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
  break_type: string;
}

export default function TimeClockScreen({ navigation }: { navigation: any }) {
  const { profile } = useAuth();
  const [timeContext, setTimeContext] = useState<{ timezone: string; basis: string; dailyClock: boolean } | null>(null);
  const { currentLocation, isTracking } = useLocation();
  const [todayEntry, setTodayEntry] = useState<DailyClockEntry | null>(null);
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [activeBreak, setActiveBreak] = useState<Break | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [pendingSync, setPendingSync] = useState(0);
  const [clockStateUnverified, setClockStateUnverified] = useState(false);

  useEffect(() => {
    loadTodaysClock();
    loadPendingSync();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [profile?.id]);

  useEffect(() => {
    if (!todayEntry) return;
    const subscription = supabase
      .channel(`daily-clock-${todayEntry.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_clock_entries', filter: `id=eq.${todayEntry.id}` }, () => loadTodaysClock())
      .subscribe();
    return () => { subscription.unsubscribe(); };
  }, [todayEntry?.id]);

  async function loadTodaysClock() {
    if (!profile) return;
    try {
      const context = await getEmployeeTimeContext(profile.id);
      setTimeContext(context);
      // A successful policy lookup does not verify the shift or break state.
      if (!context.dailyClock) return;
      const { data, error } = await supabase
        .from('daily_clock_entries')
        .select('*')
        .eq('technician_id', profile.id)
        .is('clock_out', null).order('clock_in', { ascending: false }).limit(1).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        // A different locally queued shift must not disappear merely because
        // the server returned another active shift (e.g. another device).
        // Preserve the local evidence and require explicit reconciliation.
        const unresolved = await offlineStorage.getUnresolvedClockShift(profile.id);
        if (unresolved && unresolved.id !== data.id) {
          setTodayEntry({
            id: unresolved.id, entry_date: unresolved.entry_date,
            clock_in: unresolved.clock_in, clock_out: unresolved.clock_out,
            total_hours: 0, break_minutes: 0, status: unresolved.status,
            notes: unresolved.notes,
          });
          setClockStateUnverified(true);
          setBreaks([]);
          setActiveBreak(null);
          return;
        }
        // Only confirmed server shifts are marked synced. A locally pending
        // clock-out must not be silently reopened by a stale server response.
        const local = await offlineStorage.getLocalClockShift(profile.id, data.id);
        if (local?.clock_out && (local.sync_state === 'pending' || local.sync_state === 'conflict')) {
          setTodayEntry({
            id: local.id, entry_date: local.entry_date, clock_in: local.clock_in,
            clock_out: local.clock_out, total_hours: 0, break_minutes: 0,
            status: local.status, notes: local.notes,
          });
          setClockStateUnverified(true);
          if (local.sync_state === 'conflict') {
            Alert.alert('Time record needs review', 'Your offline clock-out conflicts with the server record. The local punch is preserved for review.');
          }
          return;
        }
        await offlineStorage.saveLocalClockShift({
          id: data.id, technician_id: profile.id, entry_date: data.entry_date,
          clock_in: data.clock_in, clock_out: data.clock_out, status: data.status,
          office_id: data.office_id, notes: data.notes, sync_state: 'synced',
        });
      }
      if (data) {
        setTodayEntry(data);
        await loadBreaks(data.id);
        setClockStateUnverified(false);
      } else {
        const unresolved = await offlineStorage.getUnresolvedClockShift(profile.id);
        const local = unresolved ?? await offlineStorage.getLocalActiveClockShift(profile.id);
        if (local) {
          // Never hide a pending local punch behind a server's completed shift.
          setClockStateUnverified(true);
          setTodayEntry({ id: local.id, entry_date: local.entry_date,
            clock_in: local.clock_in, clock_out: local.clock_out, total_hours: 0,
            break_minutes: 0, status: local.status, notes: local.notes });
          setBreaks([]);
          setActiveBreak(null);
        } else {
          // Show the actual completed workday after clock-out instead of
          // immediately reverting to a misleading "READY TO CLOCK IN" card.
          const today = workDate(new Date(), context.timezone);
          const { data: completed, error: completedError } = await supabase
            .from('daily_clock_entries').select('*')
            .eq('technician_id', profile.id).eq('entry_date', today)
            .not('clock_out', 'is', null)
            .order('clock_out', { ascending: false }).limit(1).maybeSingle();
          if (completedError) throw completedError;
          setTodayEntry(completed || null);
          setClockStateUnverified(false);
          setBreaks([]);
          setActiveBreak(null);
          if (completed) await loadBreaks(completed.id);
        }
      }
    } catch (error) {
      setClockStateUnverified(true);
      // A previously verified payroll policy can render the clock screen
      // offline. The transaction itself independently checks policy age.
      try {
        const cachedPolicy = await offlineStorage.getEmployeeClockPolicy(profile.id);
        if (cachedPolicy) setTimeContext(cachedPolicy);
      } catch (policyError) {
        console.error('Offline payroll policy unavailable:', policyError);
      }
      console.error('Error loading daily clock:', error);
      try {
        const unresolved = await offlineStorage.getUnresolvedClockShift(profile.id);
        const local = unresolved ?? await offlineStorage.getLocalActiveClockShift(profile.id);
        // Connectivity failure cannot prove an existing break ended.
        // Retain the last verified break state until the server responds.
        if (local) {
          setTodayEntry({
            id: local.id, entry_date: local.entry_date, clock_in: local.clock_in,
            clock_out: local.clock_out, total_hours: 0, break_minutes: 0,
            status: local.status, notes: local.notes,
          });
          Alert.alert('Offline clock status', 'Showing your last locally saved shift. Clock changes still require a connection.');
        } else {
          setTodayEntry(null);
          Alert.alert('Connection required', 'Could not verify your current shift. Connect to the internet before clocking in or out.');
        }
      } catch (storageError) {
        console.error('Unable to restore local shift:', storageError);
        Alert.alert('Error', 'Failed to load clock data');
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadBreaks(entryId: string) {
    try {
      const { data, error } = await supabase
        .from('daily_clock_breaks')
        .select('*')
        .eq('daily_clock_entry_id', entryId)
        .order('break_start', { ascending: false });
      if (error) throw error;
      setBreaks(data || []);
      setActiveBreak(data?.find(b => !b.break_end) || null);
    } catch (error) {
      console.error('Error loading breaks; retaining last verified state:', error);
      // Break verification is required before permitting an online clock-out.
      throw error;
    }
  }

  async function loadPendingSync() {
    try {
      await offlineStorage.initialize();
      const count = await offlineStorage.getPendingBreadcrumbsCount() + await offlineStorage.getPendingClockEventsCount();
      setPendingSync(count);
    } catch (error) {
      console.error('Unable to read pending time clock sync status:', error);
    }
  }

  async function handleClockIn() {
    if (!profile) return;
    const connection = await NetInfo.fetch();
    if (connection.isConnected === false || connection.isInternetReachable === false) {
      // Offline clock-in is an explicit local punch, never a silent fallback
      // from a failed online request (which may already have reached server).
      try {
        const policy = await offlineStorage.getEmployeeClockPolicy(profile.id);
        if (!policy?.dailyClock || Date.now() - Date.parse(policy.fetchedAt) > 24 * 3600000) {
          throw new Error('Connect to verify your payroll clock settings before clocking in offline.');
        }
        if (todayEntry || await offlineStorage.getLocalActiveClockShift(profile.id) ||
            await offlineStorage.getUnresolvedClockShift(profile.id)) {
          throw new Error('An existing shift needs synchronization or review before another clock-in.');
        }
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (hasHardware && isEnrolled) {
          const auth = await LocalAuthentication.authenticateAsync({ promptMessage: 'Authenticate to clock in offline' });
          if (!auth.success) return;
        }
        const now = new Date();
        const shift = {
          id: Crypto.randomUUID(), technician_id: profile.id,
          entry_date: workDate(now, policy.timezone), clock_in: now.toISOString(),
          status: 'clocked_in' as const, office_id: profile.primary_office_id,
        };
        await offlineStorage.recordOfflineClockTransition(shift);
        // An offline payroll punch must retain GPS evidence on-device. The
        // GPS queue is linked to the shift and waits for its clock sync.
        const gpsAttemptedAt = now.toISOString();
        try {
          const location = await locationTrackingService.captureHighAccuracyLocation().catch(() => null);
          await offlineStorage.saveClockGps(
            `${shift.id}:clock_in`, shift.id, profile.id,
            {
              clock_in_gps_attempted_at: gpsAttemptedAt,
              clock_in_gps_capture_method: location ? ((location.coords as any).method === 'cached' ? 'cached' : 'high_accuracy') : 'failed',
              clock_in_latitude: location?.coords.latitude ?? null,
              clock_in_longitude: location?.coords.longitude ?? null,
              clock_in_gps_accuracy: location?.coords.accuracy ?? null,
              clock_in_gps_captured_at: location ? new Date(location.timestamp).toISOString() : null,
              clock_in_gps_duration_ms: location ? (location.coords as any).duration_ms || 0 : Date.now() - Date.parse(gpsAttemptedAt),
            },
          );
        } catch (gpsError) {
          // Never roll back a valid payroll punch because GPS storage failed.
          console.error('Offline clock-in saved; GPS evidence could not be queued:', gpsError);
          Alert.alert('GPS evidence warning', 'Your clock-in is saved, but GPS evidence could not be queued. Notify your supervisor.');
        }
        setTodayEntry({ ...shift, clock_out: null, total_hours: 0, break_minutes: 0, notes: null });
        setClockStateUnverified(true); // Block unsupported offline break/out until independently verified.
        await loadPendingSync();
        Alert.alert('Offline clock-in saved', 'Your start time is saved on this device. Offline clock-out can be saved locally for synchronization; starting or ending breaks still requires a connection.');
      } catch (error: any) {
        Alert.alert('Unable to clock in offline', error.message || 'Local punch could not be saved.');
      }
      return;
    }
    if (clockStateUnverified) {
      Alert.alert('Clock status not verified', 'Reconnect and confirm your shift status before clocking in.');
      return;
    }
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Authenticate to clock in', fallbackLabel: 'Use passcode' });
      if (!result.success) { Alert.alert('Authentication Failed', 'Please try again'); return; }
    }
    try {
      const now = new Date();
      const context = await getEmployeeTimeContext(profile.id);
      if (!context.dailyClock) return;
      const today = workDate(now, context.timezone);
      const entryId = Crypto.randomUUID();
      const clockInData: Record<string, unknown> = {
        id: entryId, technician_id: profile.id, entry_date: today, clock_in: now.toISOString(),
        status: 'clocked_in', office_id: profile.primary_office_id, offline_entry: false,
        clock_in_gps_attempted_at: now.toISOString(), clock_in_gps_capture_method: 'none',
      };
      const capture = locationTrackingService.captureHighAccuracyLocation();
      const { error } = await supabase.from('daily_clock_entries').insert(clockInData);
      if (error) throw error;
      try {
        await offlineStorage.saveLocalClockShift({
          id: entryId, technician_id: profile.id, entry_date: today,
          clock_in: now.toISOString(), clock_out: null, status: 'clocked_in',
          office_id: profile.primary_office_id, sync_state: 'synced',
        });
      } catch (storageError) {
        console.error('Server clock-in succeeded; local shift cache failed:', storageError);
      }
      void saveNativeClockGps(entryId, profile.id, false, capture, now.toISOString()).catch(e => console.error('Clock-in GPS save pending:', e));
      try {
        await locationTrackingService.startTracking(profile.id, entryId);
      } catch (trackingError) {
        console.error('Clock-in saved but GPS tracking failed:', trackingError);
        await loadTodaysClock();
        Alert.alert('GPS Tracking Unavailable', 'Clock-in saved, but background GPS did not start. Please enable background location access and notify your supervisor.');
        return;
      }
      await loadTodaysClock();
      Alert.alert('Success', 'Clocked in successfully!');
    } catch (error: any) {
      console.error('Error clocking in:', error);
      Alert.alert('Error', error.message || 'Failed to clock in');
    }
  }

  async function handleClockOut() {
    if (!todayEntry || !profile) return;
    const network = await NetInfo.fetch();
    const offline = network.isConnected === false || network.isInternetReachable === false;
    if (offline) {
      // Preserve the punch without pretending we can verify live job/break state.
      // The offline record remains pending until the server reconciles it.
      try {
        const cached = await offlineStorage.getLocalClockShift(profile.id, todayEntry.id);
        const policy = await offlineStorage.getEmployeeClockPolicy(profile.id);
        if (!cached || cached.clock_out || cached.sync_state === 'conflict' ||
            cached.clock_in !== todayEntry.clock_in ||
            !policy?.dailyClock || Date.now() - Date.parse(policy.fetchedAt) > 24 * 3600000) {
          throw new Error('Connect to verify your current shift and payroll settings.');
        }
        if (activeBreak) throw new Error('End your active break before clocking out.');
        if (Date.now() - Date.parse(cached.clock_in) > 24 * 3600000) {
          throw new Error('An older shift requires manager review.');
        }
        // Offline activity and break state cannot be verified against the server.
        // Do not silently mark this as a confirmed payroll clock-out.
        Alert.alert('Offline clock-out', 'Your clock-out will be saved on this device and must synchronize before payroll is finalized. Confirm that all job timers and breaks are stopped.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save offline punch', onPress: () => { void (async () => {
            try {
              const punchedAt = new Date().toISOString();
              await offlineStorage.recordOfflineClockTransition({
                id: cached.id, technician_id: profile.id, entry_date: cached.entry_date,
                clock_in: cached.clock_in, clock_out: punchedAt, status: 'clocked_out',
                office_id: cached.office_id, notes: null,
              });
              try {
                const location = await locationTrackingService.captureHighAccuracyLocation().catch(() => null);
                await offlineStorage.saveClockGps(`${cached.id}:clock_out`, cached.id, profile.id, {
                  clock_out_gps_attempted_at: punchedAt,
                  clock_out_gps_capture_method: location ? ((location.coords as any).method === 'cached' ? 'cached' : 'high_accuracy') : 'failed',
                  clock_out_latitude: location?.coords.latitude ?? null,
                  clock_out_longitude: location?.coords.longitude ?? null,
                  clock_out_gps_accuracy: location?.coords.accuracy ?? null,
                  clock_out_gps_captured_at: location ? new Date(location.timestamp).toISOString() : null,
                  clock_out_gps_duration_ms: location ? (location.coords as any).duration_ms || 0 : Date.now() - Date.parse(punchedAt),
                });
              } catch (gpsError) {
                console.error('Offline clock-out saved; GPS evidence could not be queued:', gpsError);
                Alert.alert('GPS evidence warning', 'Your punch was saved, but GPS evidence could not be queued. Notify your supervisor.');
              }
              setTodayEntry({ ...todayEntry, clock_out: punchedAt, status: 'clocked_out' });
              setClockStateUnverified(true);
              await loadPendingSync();
              try { await locationTrackingService.stopTracking(); }
              catch (trackingError) { console.error('Unable to stop tracking after offline clock-out:', trackingError); }
              Alert.alert('Offline punch saved', 'Your clock-out is stored locally and awaiting synchronization.');
            } catch (error: any) {
              Alert.alert('Unable to save offline punch', error.message || 'Clock-out could not be stored.');
            }
          })(); } },
        ]);
      } catch (error: any) {
        Alert.alert('Offline clock-out unavailable', error.message);
      }
      return;
    }
    if (clockStateUnverified) {
      Alert.alert('Clock status unverified', 'Reconnect and verify your shift before clocking out.');
      return;
    }
    try { await assertNoInternalTimer(profile); }
    catch (error: any) { Alert.alert('Unable to clock out', error.message); return; }
    if (activeBreak) { Alert.alert('Active Break', 'Please end your break before clocking out'); return; }
    if (Date.now() - Date.parse(todayEntry.clock_in) > 24 * 3600000) {
      Alert.alert('Unfinished shift', 'Ask your manager to correct this older shift before recording another day.');
      return;
    }
    const promptForNotes = (title: string, message: string, callback: (notes: string) => Promise<void>, type: 'plain-text') => {
      if (Platform.OS === 'ios') Alert.prompt(title, message, callback, type);
      else Alert.alert(title, 'Clock out for the day?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clock Out', onPress: () => { void callback(''); } }]);
    };
    promptForNotes('Clock Out', 'Add notes about your day (optional):', async (notes) => {
      try {
        const now = new Date();
        await assertNoInternalTimer(profile);
        const capture = locationTrackingService.captureHighAccuracyLocation();
        const updates = {
          clock_out: now.toISOString(), status: 'clocked_out', notes: notes || null,
          clock_out_gps_attempted_at: now.toISOString(), clock_out_gps_capture_method: 'none',
        };
        const { error } = await supabase.from('daily_clock_entries').update(updates).eq('id', todayEntry.id);
        if (error) throw error;
        try {
          await offlineStorage.saveLocalClockShift({
            id: todayEntry.id, technician_id: profile.id, entry_date: todayEntry.entry_date,
            clock_in: todayEntry.clock_in, clock_out: now.toISOString(),
            status: 'clocked_out', office_id: profile.primary_office_id,
            notes: notes || null, sync_state: 'synced',
          });
        } catch (storageError) {
          console.error('Server clock-out succeeded; local shift cache failed:', storageError);
        }
        void saveNativeClockGps(todayEntry.id, profile.id, true, capture, now.toISOString()).catch(e => console.error('Clock-out GPS save pending:', e));
        try {
          await locationTrackingService.stopTracking();
        } catch (trackingError) {
          console.error('Clock-out saved but GPS stop failed:', trackingError);
          await loadTodaysClock();
          Alert.alert('GPS Tracking Warning', 'Clock-out saved, but the app could not confirm GPS tracking stopped. Please notify your supervisor.');
          return;
        }
        await loadTodaysClock();
        Alert.alert('Success', 'Clocked out successfully!');
      } catch (error: any) {
        console.error('Error clocking out:', error);
        Alert.alert('Error', error.message || 'Failed to clock out');
      }
    }, 'plain-text');
  }

  async function breakGpsEvidence(phase: 'start' | 'end') {
    const attemptedAt = new Date().toISOString();
    const location = await locationTrackingService.captureHighAccuracyLocation().catch(() => null);
    return {
      [phase + '_gps_attempted_at']: attemptedAt,
      [phase + '_gps_capture_method']: location ? ((location.coords as any).method === 'cached' ? 'cached' : 'high_accuracy') : 'failed',
      [phase + '_latitude']: location?.coords.latitude ?? null,
      [phase + '_longitude']: location?.coords.longitude ?? null,
      [phase + '_gps_accuracy']: location?.coords.accuracy ?? null,
      [phase + '_gps_captured_at']: location ? new Date(location.timestamp).toISOString() : null,
    };
  }

  async function handleStartBreak(breakType: 'lunch' | 'personal' | 'other') {
    if (!todayEntry || !profile) return;
    try {
      await assertNoInternalTimer(profile);
      // Fix the punch time before GPS acquisition; location lookup may take seconds.
      const breakStartedAt = new Date().toISOString();
      const gps = await breakGpsEvidence('start');
      const { error } = await supabase.from('daily_clock_breaks').insert({
        id: Crypto.randomUUID(), daily_clock_entry_id: todayEntry.id, break_start: breakStartedAt, break_type: breakType, ...gps,
      });
      if (error) throw error;
      await loadBreaks(todayEntry.id);
    } catch (error: any) {
      console.error('Error starting break:', error);
      Alert.alert('Error', error.message || 'Failed to start break');
    }
  }

  async function handleEndBreak() {
    if (!activeBreak || !todayEntry) return;
    try {
      const breakEndedAt = new Date().toISOString();
      const gps = await breakGpsEvidence('end');
      const { error } = await supabase.from('daily_clock_breaks').update({ break_end: breakEndedAt, ...gps }).eq('id', activeBreak.id);
      if (error) throw error;
      await loadBreaks(todayEntry.id);
    } catch (error) {
      console.error('Error ending break:', error);
      Alert.alert('Error', 'Failed to end break');
    }
  }

  async function openCommandCenter() {
    if (!profile) return;
    try { await openMJV(profile.id, { commandCenter: '1' }); }
    catch (error: any) { Alert.alert('Unable to open Command Center', error.message); }
  }

  function getTimeSince(timestamp: string): string {
    const start = new Date(timestamp);
    const diff = currentTime.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  function showBreakOptions() {
    Alert.alert('Start Break', 'Select break type:', [
      { text: 'Lunch', onPress: () => handleStartBreak('lunch') },
      { text: 'Personal', onPress: () => handleStartBreak('personal') },
      { text: 'Other', onPress: () => handleStartBreak('other') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (loading) {
    return (
      <ScreenContainer center>
        <ActivityIndicator size="large" color={Colors.primary[600]} />
      </ScreenContainer>
    );
  }

  if (!timeContext?.dailyClock) {
    return (
      <ScreenContainer scroll>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>My Work & Time</Text>
          <Text style={styles.infoText}>
            {timeContext?.basis === 'work_allocation'
              ? 'Your approved Work Order time determines pay. Manual Job Time and recorded Shop/Training Time count toward payroll after manager approval.'
              : 'Your recorded job time is used for job costing. Your configuration does not require a Daily Clock.'}
          </Text>
          <TouchableOpacity onPress={openCommandCenter} style={styles.linkButton}>
            <Text style={styles.linkText}>Daily Calendar, My Time & Requests</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('WorkOrders')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Open My Work Orders</Text>
          </TouchableOpacity>
        </View>
        <InternalTimeCard key={profile?.id} />
      </ScreenContainer>
    );
  }

  const isClockedIn = todayEntry && !todayEntry.clock_out;
  const isClockedOut = todayEntry && todayEntry.clock_out;
  const gradientColors: [string, string] = isClockedOut
    ? [Colors.gray[600], Colors.gray[700]]
    : isClockedIn
    ? [Colors.green[500], Colors.green[600]]
    : [Colors.primary[500], Colors.primary[600]];

  return (
    <ScreenContainer scroll>
      {/* GPS Status Banner */}
      <View style={[styles.statusBanner, isTracking ? styles.trackingActive : styles.trackingInactive]}>
        <View style={styles.bannerContent}>
          <View style={[styles.bannerDot, { backgroundColor: Colors.white }]} />
          <Text style={styles.bannerText}>
            {isTracking ? 'GPS Tracking Active' : 'GPS Tracking Inactive'}
          </Text>
        </View>
        {currentLocation && (
          <Text style={styles.bannerSubtext}>
            Accuracy: {currentLocation.coords.accuracy?.toFixed(0)}m
          </Text>
        )}
      </View>

      {/* Sync Status */}
      {pendingSync > 0 && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncText}>
            {pendingSync} time or location record{pendingSync !== 1 ? 's' : ''} awaiting sync
          </Text>
        </View>
      )}

      {clockStateUnverified && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncText}>Clock status unverified. Offline clock-out may be saved locally; synchronization is required for payroll.</Text>
        </View>
      )}

      {/* Main Clock Card */}
      <LinearGradient colors={gradientColors} style={styles.clockCard}>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>
            {isClockedOut ? 'CLOCKED OUT' : isClockedIn ? 'CLOCKED IN' : 'READY TO CLOCK IN'}
          </Text>
        </View>

        <Text style={styles.currentTime}>
          {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </Text>

        <Text style={styles.currentDate}>
          {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>

        {!todayEntry && (
          <TouchableOpacity style={styles.clockButton} onPress={handleClockIn} disabled={clockStateUnverified && !!todayEntry} activeOpacity={0.85}>
            <Text style={styles.clockButtonText}>CLOCK IN</Text>
          </TouchableOpacity>
        )}

        {isClockedIn && todayEntry && (
          <View style={styles.activeClockSection}>
            <View style={styles.elapsedTimeCard}>
              <Text style={styles.elapsedTimeLabel}>Time Elapsed</Text>
              <Text style={styles.elapsedTime}>{getTimeSince(todayEntry.clock_in)}</Text>
              <Text style={styles.clockInTime}>
                Started at {new Date(todayEntry.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            <View style={styles.actionButtons}>
              {!activeBreak ? (
                <TouchableOpacity style={styles.breakButton} onPress={showBreakOptions} activeOpacity={0.8}>
                  <Text style={styles.breakButtonText}>Start Break</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.endBreakButton} onPress={handleEndBreak} activeOpacity={0.8}>
                  <Text style={styles.endBreakButtonText}>End Break</Text>
                  <Text style={styles.breakElapsed}>
                    {Math.floor((currentTime.getTime() - new Date(activeBreak.break_start).getTime()) / 60000)}m elapsed
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.clockOutButton, !!activeBreak && styles.disabledButton]}
                onPress={handleClockOut}
                disabled={!!activeBreak}
                activeOpacity={0.8}
              >
                <Text style={styles.clockOutButtonText}>Clock Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isClockedOut && todayEntry && (
          <View style={styles.completedCard}>
            <View style={styles.completedCheckmark}>
              <View style={styles.completedCheckInner} />
            </View>
            <Text style={styles.completedTitle}>Clocked Out</Text>
            {clockStateUnverified ? (
              <Text style={styles.completedHours}>Hours pending synchronization or review</Text>
            ) : (
              <Text style={styles.completedHours}>Total Hours: {Number(todayEntry.total_hours || 0).toFixed(2)}</Text>
            )}
            <Text style={styles.completedTime}>
              {new Date(todayEntry.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              {' - '}
              {new Date(todayEntry.clock_out!).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}
      </LinearGradient>

      <InternalTimeCard key={profile?.id} />

      {/* Breaks History */}
      {breaks.length > 0 && (
        <Card style={styles.breaksCard}>
          <Text style={styles.breaksTitle}>Today's Breaks</Text>
          {breaks.map(brk => (
            <View key={brk.id} style={styles.breakItem}>
              <View>
                <Text style={styles.breakType}>{brk.break_type}</Text>
                <Text style={styles.breakTime}>
                  {new Date(brk.break_start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  {brk.break_end && ` - ${new Date(brk.break_end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
                </Text>
              </View>
              {brk.break_end ? (
                <Text style={styles.breakDuration}>
                  {Math.floor((new Date(brk.break_end).getTime() - new Date(brk.break_start).getTime()) / 60000)}m
                </Text>
              ) : (
                <View style={styles.breakActiveBadge}>
                  <View style={styles.breakActiveDot} />
                  <Text style={styles.breakActiveText}>Active</Text>
                </View>
              )}
            </View>
          ))}
        </Card>
      )}

      {/* View History Link */}
      <TouchableOpacity style={styles.historyLink} onPress={() => navigation.navigate('TimeHistory')} activeOpacity={0.7}>
        <Text style={styles.historyLinkText}>View My Time History</Text>
        <View style={styles.chevronRight} />
      </TouchableOpacity>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[100] },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gray[100] },
  statusBanner: { padding: Spacing.md + 2, alignItems: 'center' },
  trackingActive: { backgroundColor: Colors.green[500] },
  trackingInactive: { backgroundColor: Colors.gray[600] },
  bannerContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },
  bannerText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  bannerSubtext: { color: Colors.white, fontSize: 12, opacity: 0.85, marginTop: 4 },
  syncBanner: { backgroundColor: Colors.amber[400], padding: Spacing.sm + 2, alignItems: 'center' },
  syncText: { color: Colors.amber[700], fontWeight: '600', fontSize: 12 },
  clockCard: {
    margin: Spacing.lg, borderRadius: Radius.xxl, padding: Spacing.xxl, alignItems: 'center', ...Shadows.large,
  },
  statusBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.pill, marginBottom: Spacing.lg,
  },
  statusBadgeText: { color: Colors.white, fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
  currentTime: { fontSize: 52, fontWeight: '700', color: Colors.white, marginBottom: Spacing.sm, fontVariant: ['tabular-nums'] },
  currentDate: { fontSize: 18, color: Colors.white, opacity: 0.9, marginBottom: Spacing.xxl },
  clockButton: {
    backgroundColor: Colors.white, paddingVertical: Spacing.xl, paddingHorizontal: Spacing.xxxl + Spacing.xl,
    borderRadius: Radius.lg, ...Shadows.medium,
  },
  clockButtonText: { fontSize: 22, fontWeight: '700', color: Colors.primary[600], letterSpacing: 1 },
  activeClockSection: { width: '100%' },
  elapsedTimeCard: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.lg, padding: Spacing.lg + 2,
    alignItems: 'center', marginBottom: Spacing.lg,
  },
  elapsedTimeLabel: { color: Colors.white, fontSize: 12, opacity: 0.85, marginBottom: Spacing.xs },
  elapsedTime: { fontSize: 40, fontWeight: '700', color: Colors.white, marginBottom: Spacing.xs, fontVariant: ['tabular-nums'] },
  clockInTime: { color: Colors.white, fontSize: 12, opacity: 0.7 },
  actionButtons: { flexDirection: 'row', gap: Spacing.md },
  breakButton: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.md,
    paddingVertical: Spacing.lg, alignItems: 'center',
  },
  breakButtonText: { color: Colors.white, fontWeight: '600', fontSize: 15 },
  endBreakButton: {
    flex: 1, backgroundColor: Colors.amber[400], borderRadius: Radius.md, paddingVertical: Spacing.lg, alignItems: 'center',
  },
  endBreakButtonText: { color: Colors.amber[700], fontWeight: '700', fontSize: 15 },
  breakElapsed: { color: Colors.amber[700], fontSize: 11, marginTop: Spacing.xs },
  clockOutButton: {
    flex: 1, backgroundColor: Colors.red[500], borderRadius: Radius.md, paddingVertical: Spacing.lg, alignItems: 'center',
  },
  disabledButton: { opacity: 0.5 },
  clockOutButtonText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  completedCard: { alignItems: 'center', paddingVertical: Spacing.lg },
  completedCheckmark: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  completedCheckInner: {
    width: 16, height: 9, borderLeftWidth: 3, borderBottomWidth: 3, borderColor: Colors.white,
    transform: [{ rotate: '-45deg' }], marginTop: 3,
  },
  completedTitle: { fontSize: 22, fontWeight: '700', color: Colors.white, marginBottom: Spacing.sm },
  completedHours: { fontSize: 18, color: Colors.white, marginBottom: Spacing.xs },
  completedTime: { fontSize: 12, color: Colors.white, opacity: 0.7 },
  breaksCard: { marginTop: 0 },
  breaksTitle: { ...Typography.heading, marginBottom: Spacing.md },
  breakItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.gray[50], borderRadius: Radius.sm, marginBottom: Spacing.sm,
  },
  breakType: { fontSize: 14, fontWeight: '600', color: Colors.gray[900], textTransform: 'capitalize' },
  breakTime: { fontSize: 12, color: Colors.gray[500], marginTop: 2 },
  breakDuration: { fontSize: 14, fontWeight: '600', color: Colors.gray[600] },
  breakActiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breakActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.amber[500] },
  breakActiveText: { fontSize: 12, fontWeight: '700', color: Colors.amber[600] },
  historyLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    margin: Spacing.lg, padding: Spacing.lg, gap: Spacing.sm,
  },
  historyLinkText: { ...Typography.body, color: Colors.primary[600], fontWeight: '600' },
  chevronRight: {
    width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: Colors.primary[400],
    transform: [{ rotate: '45deg' }],
  },
  infoCard: {
    margin: Spacing.lg, padding: Spacing.xxl, backgroundColor: Colors.primary[50],
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary[200],
  },
  infoTitle: { ...Typography.title, marginBottom: Spacing.sm },
  infoText: { ...Typography.body, color: Colors.gray[600], lineHeight: 22 },
  linkButton: { padding: Spacing.md, marginTop: Spacing.md },
  linkText: { color: Colors.primary[600], textAlign: 'center', fontWeight: '600', fontSize: 14 },
  primaryButton: { padding: Spacing.lg + 2, backgroundColor: Colors.primary[600], borderRadius: Radius.md, marginTop: Spacing.sm },
  primaryButtonText: { color: Colors.white, textAlign: 'center', fontWeight: '700', fontSize: 15 },
});
