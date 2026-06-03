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

export default function TimeClockScreen() {
  const { profile } = useAuth();
  const { currentLocation, isTracking } = useLocation();
  const [todayEntry, setTodayEntry] = useState<DailyClockEntry | null>(null);
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [activeBreak, setActiveBreak] = useState<Break | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [pendingSync, setPendingSync] = useState(0);

  useEffect(() => {
    loadTodaysClock();
    loadPendingSync();

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!todayEntry) return;

    const subscription = supabase
      .channel(`daily-clock-${todayEntry.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_clock_entries',
        filter: `id=eq.${todayEntry.id}`,
      }, () => {
        loadTodaysClock();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [todayEntry?.id]);

  async function loadTodaysClock() {
    if (!profile) return;

    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('daily_clock_entries')
        .select('*')
        .eq('technician_id', profile.id)
        .eq('entry_date', today)
        .is('clock_out', null)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      setTodayEntry(data);

      if (data) {
        await loadBreaks(data.id);
      }
    } catch (error) {
      console.error('Error loading daily clock:', error);
      Alert.alert('Error', 'Failed to load clock data');
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
      const active = data?.find(b => !b.break_end);
      setActiveBreak(active || null);
    } catch (error) {
      console.error('Error loading breaks:', error);
    }
  }

  async function loadPendingSync() {
    const count = await offlineStorage.getPendingBreadcrumbsCount() +
                  await offlineStorage.getPendingClockEventsCount();
    setPendingSync(count);
  }

  async function handleClockIn() {
    if (!profile) return;

    // Biometric authentication
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to clock in',
        fallbackLabel: 'Use passcode',
      });

      if (!result.success) {
        Alert.alert('Authentication Failed', 'Please try again');
        return;
      }
    }

    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const entryId = `${Date.now()}-${Math.random()}`;

      const clockInData = {
        id: entryId,
        technician_id: profile.id,
        entry_date: today,
        clock_in: now.toISOString(),
        status: 'clocked_in',
        office_id: profile.primary_office_id,
        offline_entry: false,
      };

      // Capture high-accuracy location
      const location = await locationTrackingService.captureHighAccuracyLocation();

      if (location) {
        Object.assign(clockInData, {
          clock_in_latitude: location.coords.latitude,
          clock_in_longitude: location.coords.longitude,
          clock_in_gps_accuracy: location.coords.accuracy,
          clock_in_gps_capture_method: 'native_mobile',
        });
      }

      const { error } = await supabase
        .from('daily_clock_entries')
        .insert(clockInData);

      if (error) throw error;

      // Start background GPS tracking
      await locationTrackingService.startTracking(profile.id, entryId);

      await loadTodaysClock();
      Alert.alert('Success', 'Clocked in successfully!');
    } catch (error: any) {
      console.error('Error clocking in:', error);
      Alert.alert('Error', error.message || 'Failed to clock in');
    }
  }

  async function handleClockOut() {
    if (!todayEntry || !profile) return;

    if (activeBreak) {
      Alert.alert('Active Break', 'Please end your break before clocking out');
      return;
    }

    Alert.prompt(
      'Clock Out',
      'Add notes about your day (optional):',
      async (notes) => {
        try {
          const now = new Date();

          // Capture final location
          const location = await locationTrackingService.captureHighAccuracyLocation();

          const updates: any = {
            clock_out: now.toISOString(),
            status: 'clocked_out',
            notes: notes || null,
          };

          if (location) {
            updates.clock_out_latitude = location.coords.latitude;
            updates.clock_out_longitude = location.coords.longitude;
            updates.clock_out_gps_accuracy = location.coords.accuracy;
          }

          const { error } = await supabase
            .from('daily_clock_entries')
            .update(updates)
            .eq('id', todayEntry.id);

          if (error) throw error;

          // Stop GPS tracking
          await locationTrackingService.stopTracking();

          await loadTodaysClock();
          Alert.alert('Success', 'Clocked out successfully!');
        } catch (error: any) {
          console.error('Error clocking out:', error);
          Alert.alert('Error', error.message || 'Failed to clock out');
        }
      },
      'plain-text'
    );
  }

  async function handleStartBreak(breakType: 'lunch' | 'personal' | 'other') {
    if (!todayEntry) return;

    try {
      const { error } = await supabase
        .from('daily_clock_breaks')
        .insert({
          id: `${Date.now()}-${Math.random()}`,
          daily_clock_entry_id: todayEntry.id,
          break_start: new Date().toISOString(),
          break_type: breakType,
        });

      if (error) throw error;

      await loadBreaks(todayEntry.id);
    } catch (error) {
      console.error('Error starting break:', error);
      Alert.alert('Error', 'Failed to start break');
    }
  }

  async function handleEndBreak() {
    if (!activeBreak || !todayEntry) return;

    try {
      const { error } = await supabase
        .from('daily_clock_breaks')
        .update({ break_end: new Date().toISOString() })
        .eq('id', activeBreak.id);

      if (error) throw error;

      await loadBreaks(todayEntry.id);
    } catch (error) {
      console.error('Error ending break:', error);
      Alert.alert('Error', 'Failed to end break');
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

  function showBreakOptions() {
    Alert.alert(
      'Start Break',
      'Select break type:',
      [
        { text: 'Lunch', onPress: () => handleStartBreak('lunch') },
        { text: 'Personal', onPress: () => handleStartBreak('personal') },
        { text: 'Other', onPress: () => handleStartBreak('other') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!profile?.requires_daily_clock) {
    return (
      <View style={styles.container}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Daily Clock Not Required</Text>
          <Text style={styles.infoText}>
            Your employment type ({profile?.employment_type}) does not require daily clock-in/out.
          </Text>
        </View>
      </View>
    );
  }

  const isClockedIn = todayEntry && !todayEntry.clock_out;
  const isClockedOut = todayEntry && todayEntry.clock_out;

  return (
    <ScrollView style={styles.container}>
      {/* GPS Status Banner */}
      <View style={[styles.statusBanner, isTracking ? styles.trackingActive : styles.trackingInactive]}>
        <Text style={styles.statusText}>
          {isTracking ? '🛰️ GPS Tracking Active' : '📍 GPS Tracking Inactive'}
        </Text>
        {currentLocation && (
          <Text style={styles.statusSubtext}>
            Accuracy: {currentLocation.coords.accuracy?.toFixed(0)}m
          </Text>
        )}
      </View>

      {/* Sync Status */}
      {pendingSync > 0 && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncText}>
            {pendingSync} location{pendingSync !== 1 ? 's' : ''} pending sync
          </Text>
        </View>
      )}

      {/* Main Clock Card */}
      <LinearGradient
        colors={
          isClockedOut
            ? ['#6b7280', '#4b5563']
            : isClockedIn
            ? ['#10b981', '#059669']
            : ['#3b82f6', '#2563eb']
        }
        style={styles.clockCard}
      >
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>
            {isClockedOut ? 'CLOCKED OUT' : isClockedIn ? 'CLOCKED IN' : 'READY TO CLOCK IN'}
          </Text>
        </View>

        <Text style={styles.currentTime}>
          {currentTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })}
        </Text>

        <Text style={styles.currentDate}>
          {currentTime.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })}
        </Text>

        {!todayEntry && (
          <TouchableOpacity style={styles.clockButton} onPress={handleClockIn}>
            <Text style={styles.clockButtonText}>▶ CLOCK IN</Text>
          </TouchableOpacity>
        )}

        {isClockedIn && (
          <View style={styles.activeClockSection}>
            <View style={styles.elapsedTimeCard}>
              <Text style={styles.elapsedTimeLabel}>Time Elapsed</Text>
              <Text style={styles.elapsedTime}>{getTimeSince(todayEntry.clock_in)}</Text>
              <Text style={styles.clockInTime}>
                Started at {new Date(todayEntry.clock_in).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </View>

            <View style={styles.actionButtons}>
              {!activeBreak ? (
                <TouchableOpacity
                  style={styles.breakButton}
                  onPress={showBreakOptions}
                >
                  <Text style={styles.breakButtonText}>☕ Start Break</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.endBreakButton}
                  onPress={handleEndBreak}
                >
                  <Text style={styles.endBreakButtonText}>End Break</Text>
                  <Text style={styles.breakElapsed}>
                    {Math.floor((currentTime.getTime() - new Date(activeBreak.break_start).getTime()) / 60000)}m elapsed
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.clockOutButton, activeBreak && styles.disabledButton]}
                onPress={handleClockOut}
                disabled={!!activeBreak}
              >
                <Text style={styles.clockOutButtonText}>⏹ Clock Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isClockedOut && (
          <View style={styles.completedCard}>
            <Text style={styles.completedIcon}>✓</Text>
            <Text style={styles.completedTitle}>Clocked Out</Text>
            <Text style={styles.completedHours}>
              Total Hours: {todayEntry.total_hours.toFixed(2)}
            </Text>
            <Text style={styles.completedTime}>
              {new Date(todayEntry.clock_in).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })} - {new Date(todayEntry.clock_out!).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          </View>
        )}
      </LinearGradient>

      {/* Breaks History */}
      {breaks.length > 0 && (
        <View style={styles.breaksCard}>
          <Text style={styles.breaksTitle}>☕ Today's Breaks</Text>
          {breaks.map(brk => (
            <View key={brk.id} style={styles.breakItem}>
              <View>
                <Text style={styles.breakType}>{brk.break_type}</Text>
                <Text style={styles.breakTime}>
                  {new Date(brk.break_start).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                  {brk.break_end && ` - ${new Date(brk.break_end).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}`}
                </Text>
              </View>
              {brk.break_end ? (
                <Text style={styles.breakDuration}>
                  {Math.floor((new Date(brk.break_end).getTime() - new Date(brk.break_start).getTime()) / 60000)}m
                </Text>
              ) : (
                <Text style={styles.breakActive}>Active</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBanner: {
    padding: 12,
    alignItems: 'center',
  },
  trackingActive: {
    backgroundColor: '#10b981',
  },
  trackingInactive: {
    backgroundColor: '#6b7280',
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  statusSubtext: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
  },
  syncBanner: {
    backgroundColor: '#fbbf24',
    padding: 8,
    alignItems: 'center',
  },
  syncText: {
    color: '#78350f',
    fontWeight: '600',
    fontSize: 12,
  },
  clockCard: {
    margin: 16,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  statusBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  statusBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  currentTime: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  currentDate: {
    fontSize: 18,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 24,
  },
  clockButton: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 48,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  clockButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  activeClockSection: {
    width: '100%',
  },
  elapsedTimeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  elapsedTimeLabel: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
    marginBottom: 4,
  },
  elapsedTime: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  clockInTime: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.75,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  breakButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  breakButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  endBreakButton: {
    flex: 1,
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  endBreakButtonText: {
    color: '#78350f',
    fontWeight: 'bold',
  },
  breakElapsed: {
    color: '#78350f',
    fontSize: 10,
    marginTop: 4,
  },
  clockOutButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  clockOutButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  completedCard: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  completedIcon: {
    fontSize: 48,
    color: '#d1fae5',
    marginBottom: 8,
  },
  completedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  completedHours: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 4,
  },
  completedTime: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.75,
  },
  breaksCard: {
    margin: 16,
    marginTop: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  breaksTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  breakItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
  },
  breakType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    textTransform: 'capitalize',
  },
  breakTime: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  breakDuration: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  breakActive: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fbbf24',
  },
  infoCard: {
    margin: 16,
    padding: 24,
    backgroundColor: '#dbeafe',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#4b5563',
  },
});
