import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Clock, AlertCircle, CheckCircle, AlertTriangle, Check, CreditCard as Edit2, Briefcase, Trash2, Bell, Send, MapPin, Upload, HelpCircle, X, FileText, Download, User, LayoutList, BarChart3, Wrench } from 'lucide-react';
import { ManualTimeEntry } from './ManualTimeEntry';
import { ManualJobTimeEntry } from './ManualJobTimeEntry';
import { RequestReviewModal } from './RequestReviewModal';
import { TimeAdjustmentRequestModal } from '../Technician/TimeAdjustmentRequestModal';
import { GPSHistoryModal } from './GPSHistoryModal';
import { TimeClockCSVImport } from '../Admin/TimeClockCSVImport';
import { JobTimeCSVImport } from '../Admin/JobTimeCSVImport';
import { JobTimeHistory } from './JobTimeHistory';
import { InternalSessionsManagement } from './InternalSessionsManagement';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';
import {
  getOrganizationTimezone,
  createTimestampInTimezone,
  formatTimeInTimezone,
  getTimezoneLabel
} from '../../lib/timezoneUtils';
import { TimePicker } from '../Shared/TimePicker';

// Format a UTC timestamp as 12-hour time in the org's timezone
function formatTime12Hour(dateString: string, timezone: string = 'America/Chicago'): string {
  return formatTimeInTimezone(dateString, timezone, 'h:mm aa');
}

// Helper function to parse date-only strings in local timezone (not UTC)
function parseLocalDate(dateString: string): Date {
  // If the date string is just YYYY-MM-DD without time, parse it as local date
  // to avoid timezone conversion issues
  const parts = dateString.split('T')[0].split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  return new Date(dateString);
}

// Helper function to format date in local timezone
function formatLocalDate(dateString: string): string {
  return parseLocalDate(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
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
  admin_adjusted: boolean;
  adjustment_reason: string | null;
  offline_entry: boolean;
  admin_reviewed: boolean;
  admin_reviewed_by: string | null;
  admin_reviewed_at: string | null;
  admin_notes: string | null;
  auto_clocked_out: boolean;
  auto_clocked_out_at: string | null;
  auto_clock_out_approved: boolean;
  auto_clock_out_approved_by: string | null;
  auto_clock_out_approved_at: string | null;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_in_address: string | null;
  clock_in_gps_accuracy: number | null;
  clock_in_gps_capture_method: string | null;
  clock_in_gps_attempted_at: string | null;
  clock_in_gps_captured_at: string | null;
  clock_in_gps_duration_ms: number | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
  clock_out_address: string | null;
  clock_out_gps_accuracy: number | null;
  clock_out_gps_capture_method: string | null;
  clock_out_gps_attempted_at: string | null;
  clock_out_gps_captured_at: string | null;
  clock_out_gps_duration_ms: number | null;
  technician_id: string;
  technician: {
    id: string;
    full_name: string;
    employment_type: string;
    standard_start_time: string | null;
  };
  breaks: ClockBreak[];
}

interface ClockBreak {
  id: string;
  break_start: string;
  break_end: string | null;
  break_duration_minutes: number;
  break_type: string;
}

interface EmployeeOption {
  id: string;
  full_name: string;
}

interface ClockAlert {
  id: string;
  technician_id: string;
  alert_date: string;
  alert_type: string;
  scheduled_start_time: string;
  actual_clock_in_time: string | null;
  minutes_late: number | null;
  resolved: boolean;
  has_gps: boolean;
  gps_entry?: {
    id: string;
    clock_in: string;
    clock_out: string | null;
    clock_in_latitude: number | null;
    clock_in_longitude: number | null;
    clock_in_address: string | null;
    clock_in_gps_accuracy: number | null;
    clock_in_gps_capture_method: string | null;
    clock_in_gps_attempted_at: string | null;
    clock_in_gps_captured_at: string | null;
    clock_in_gps_duration_ms: number | null;
    clock_out_latitude: number | null;
    clock_out_longitude: number | null;
    clock_out_address: string | null;
    clock_out_gps_accuracy: number | null;
    clock_out_gps_capture_method: string | null;
    clock_out_gps_attempted_at: string | null;
    clock_out_gps_captured_at: string | null;
    clock_out_gps_duration_ms: number | null;
  };
  technician: {
    id: string;
    full_name: string;
  };
}

interface EditAlertTime {
  alertId: string;
  employeeId: string;
  employeeName: string;
  alertDate: string;
  suggestedTime: string;
}

interface PendingAutoClockOut {
  id: string;
  technician_id: string;
  full_name: string;
  email: string;
  entry_date: string;
  clock_in: string;
  will_clock_out_at: string;
  hours_since_clock_in: number;
}

interface TimeClockHistoryProps {
  onNavigate?: (tab: string) => void;
  initialTab?: 'clock' | 'job_time' | 'sessions';
}

export function TimeClockHistory({ onNavigate, initialTab }: TimeClockHistoryProps = {}) {
  const { profile, loading: authLoading } = useAuth();
  const [orgTimezone, setOrgTimezone] = useState<string>('America/Chicago');
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [alerts, setAlerts] = useState<ClockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'this_week' | 'week' | 'month' | 'custom'>('this_week');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showManualJobEntry, setShowManualJobEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ClockEntry | null>(null);
  const [pendingAutoClockOutEntries, setPendingAutoClockOutEntries] = useState<PendingAutoClockOut[]>([]);
  const [processingClockOut, setProcessingClockOut] = useState<string | null>(null);
  const [editAlertTime, setEditAlertTime] = useState<EditAlertTime | null>(null);
  const [editAlertClockInTime, setEditAlertClockInTime] = useState<string>('');
  const [processingAlert, setProcessingAlert] = useState<string | null>(null);
  const [reviewingOfflineEntry, setReviewingOfflineEntry] = useState<string | null>(null);
  const [offlineReviewNotes, setOfflineReviewNotes] = useState<string>('');
  const [pendingRequests, setPendingRequests] = useState<Record<string, number>>({});
  const [showOnlyPendingRequests, setShowOnlyPendingRequests] = useState(false);
  const [reviewingRequestEntryId, setReviewingRequestEntryId] = useState<string | null>(null);
  const [requestingAdjustmentEntry, setRequestingAdjustmentEntry] = useState<ClockEntry | null>(null);
  const [viewingGPSEntry, setViewingGPSEntry] = useState<ClockEntry | null>(null);
  const [viewingAlertGPS, setViewingAlertGPS] = useState<ClockAlert | null>(null);
  const [autoClockOutsPendingApproval, setAutoClockOutsPendingApproval] = useState<ClockEntry[]>([]);
  const [approvingAutoClockOut, setApprovingAutoClockOut] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showJobTimeImport, setShowJobTimeImport] = useState(false);
  const [showCSVTutorial, setShowCSVTutorial] = useState(false);
  const [activeTab, setActiveTab] = useState<'clock' | 'job_time' | 'sessions'>(initialTab ?? 'clock');
  const [confirmDeleteClockEntry, setConfirmDeleteClockEntry] = useState<ClockEntry | null>(null);
  const [deletingClockId, setDeletingClockId] = useState<string | null>(null);
  const [confirmAutoClockOutEntry, setConfirmAutoClockOutEntry] = useState<PendingAutoClockOut | null>(null);

  useEffect(() => {
    getOrganizationTimezone().then(tz => setOrgTimezone(tz));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setLoading(false);
      return;
    }
    Promise.all([
      loadEmployees(),
      loadAlerts(),
      checkPendingAutoClockOuts(),
      loadPendingRequests(),
      loadAutoClockOutsPendingApproval()
    ]);
  }, [authLoading, profile]);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setLoading(false);
      return;
    }
    loadEntries(true);
  }, [authLoading, profile, selectedEmployee, dateRange, startDate, endDate]);

  // Update current time every 30 seconds for elapsed time calculation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Set up real-time subscriptions with debouncing
  useEffect(() => {
    // Use longer debounce to prevent excessive reloads
    let debounceTimer: NodeJS.Timeout;
    let pendingUpdates = new Set<string>();

    const handleUpdate = (table: string) => {
      pendingUpdates.add(table);
      clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
        // Batch all pending updates into a single reload
        const updates: Promise<any>[] = [];

        if (pendingUpdates.has('daily_clock_entries')) {
          updates.push(loadEntries(), checkPendingAutoClockOuts(), loadAutoClockOutsPendingApproval());
        }
        if (pendingUpdates.has('time_clock_alerts')) {
          updates.push(loadAlerts());
        }
        if (pendingUpdates.has('time_adjustment_requests')) {
          updates.push(loadPendingRequests());
        }

        Promise.all(updates);
        pendingUpdates.clear();
      }, 1000); // Longer debounce time
    };

    const channel = supabase
      .channel('time-clock-history-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_clock_entries'
      }, () => handleUpdate('daily_clock_entries'))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'time_clock_alerts'
      }, () => handleUpdate('time_clock_alerts'))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'time_adjustment_requests'
      }, () => handleUpdate('time_adjustment_requests'))
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      channel.unsubscribe();
    };
  }, []);

  async function loadEmployees() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'tech')
        .eq('is_active', true)
        .order('full_name');

      if (error) {
        console.error('Error loading employees:', error);
        throw error;
      }
      setEmployees(data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
      // Set empty array so UI doesn't break
      setEmployees([]);
    }
  }

  async function loadPendingRequests() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('time_adjustment_requests')
        .select('daily_clock_entry_id')
        .eq('status', 'pending')
        .gte('created_at', thirtyDaysAgo);

      if (error) throw error;

      const requestCounts: Record<string, number> = {};
      data?.forEach(req => {
        requestCounts[req.daily_clock_entry_id] = (requestCounts[req.daily_clock_entry_id] || 0) + 1;
      });
      setPendingRequests(requestCounts);
    } catch (error) {
      console.error('Error loading pending requests:', error);
    }
  }

  async function loadAlerts() {
    try {
      const sevenDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Fetch alerts and GPS entries in parallel to avoid N+1 queries
      const [alertsResult, gpsEntriesResult] = await Promise.all([
        supabase
          .from('time_clock_alerts')
          .select(`
            *,
            technician:profiles!technician_id(id, full_name)
          `)
          .eq('resolved', false)
          .gte('alert_date', sevenDaysAgo)
          .order('alert_date', { ascending: false }),

        supabase
          .from('daily_clock_entries')
          .select(`
            technician_id,
            entry_date,
            id,
            clock_in,
            clock_out,
            clock_in_latitude,
            clock_in_longitude,
            clock_in_address,
            clock_in_gps_accuracy,
            clock_in_gps_capture_method,
            clock_in_gps_attempted_at,
            clock_in_gps_captured_at,
            clock_in_gps_duration_ms,
            clock_out_latitude,
            clock_out_longitude,
            clock_out_address,
            clock_out_gps_accuracy,
            clock_out_gps_capture_method,
            clock_out_gps_attempted_at,
            clock_out_gps_captured_at,
            clock_out_gps_duration_ms
          `)
          .gte('entry_date', sevenDaysAgo)
      ]);

      if (alertsResult.error) throw alertsResult.error;

      // Create a map for fast GPS entry lookup
      const gpsEntriesMap = new Map();
      gpsEntriesResult.data?.forEach(entry => {
        const key = `${entry.technician_id}-${entry.entry_date}`;
        gpsEntriesMap.set(key, entry);
      });

      // Combine alerts with GPS data using the map
      const alertsWithGPS = (alertsResult.data || []).map(alert => {
        const key = `${alert.technician_id}-${alert.alert_date}`;
        const entry = gpsEntriesMap.get(key);

        return {
          ...alert,
          has_gps: entry?.clock_in_latitude != null,
          gps_entry: entry || undefined
        };
      });

      setAlerts(alertsWithGPS);
    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  }

  async function approveAlertClockIn(clockAlert: ClockAlert) {
    if (!clockAlert.actual_clock_in_time) {
      window.alert('No clock-in time recorded. Please use Edit to set a time.');
      return;
    }

    // Optimistically remove from UI immediately
    setAlerts(prev => prev.filter(a => a.id !== clockAlert.id));
    setProcessingAlert(clockAlert.id);
    try {
      // Check if clock entry already exists for this date
      const { data: existingEntry } = await supabase
        .from('daily_clock_entries')
        .select('id')
        .eq('technician_id', clockAlert.technician_id)
        .eq('entry_date', clockAlert.alert_date)
        .maybeSingle();

      if (existingEntry) {
        const { error: resolveError } = await supabase
          .from('time_clock_alerts')
          .update({ resolved: true, resolved_at: new Date().toISOString() })
          .eq('id', clockAlert.id);
        if (resolveError) throw resolveError;
        await Promise.all([loadAlerts(), loadEntries()]);
        return;
      }

      const clockInTimestamp = createTimestampInTimezone(
        clockAlert.alert_date,
        clockAlert.actual_clock_in_time!,
        orgTimezone
      );

      const { error: insertError } = await supabase
        .from('daily_clock_entries')
        .insert({
          technician_id: clockAlert.technician_id,
          entry_date: clockAlert.alert_date,
          clock_in: clockInTimestamp,
          status: 'clocked_in',
          admin_adjusted: true,
          adjustment_reason: `Approved by admin - Originally ${clockAlert.minutes_late} minutes late`
        });
      if (insertError) throw insertError;

      const { error: resolveError } = await supabase
        .from('time_clock_alerts')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', clockAlert.id);
      if (resolveError) throw resolveError;

      await Promise.all([loadAlerts(), loadEntries()]);
    } catch (err) {
      console.error('Error approving clock-in:', err);
      // Restore the alert if something failed
      await loadAlerts();
    } finally {
      setProcessingAlert(null);
    }
  }

  async function approveAllAlerts() {
    if (!alerts.length) return;
    setProcessingAlert('all');
    const snapshot = [...alerts];
    setAlerts([]);
    try {
      const ids = snapshot.map(a => a.id);
      const { error } = await supabase
        .from('time_clock_alerts')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;

      // For alerts that have an actual_clock_in_time, create clock entries
      const alertsWithTime = snapshot.filter(a => a.actual_clock_in_time);
      for (const clockAlert of alertsWithTime) {
        const { data: existing } = await supabase
          .from('daily_clock_entries')
          .select('id')
          .eq('technician_id', clockAlert.technician_id)
          .eq('entry_date', clockAlert.alert_date)
          .maybeSingle();
        if (!existing) {
          const clockInTimestamp = createTimestampInTimezone(
            clockAlert.alert_date,
            clockAlert.actual_clock_in_time!,
            orgTimezone
          );
          await supabase.from('daily_clock_entries').insert({
            technician_id: clockAlert.technician_id,
            entry_date: clockAlert.alert_date,
            clock_in: clockInTimestamp,
            status: 'clocked_in',
            admin_adjusted: true,
            adjustment_reason: `Approved by admin - Originally ${clockAlert.minutes_late} minutes late`
          });
        }
      }

      await Promise.all([loadAlerts(), loadEntries()]);
    } catch (err) {
      console.error('Error approving all alerts:', err);
      await loadAlerts();
    } finally {
      setProcessingAlert(null);
    }
  }

  async function deleteAlert(alertId: string) {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    try {
      const { error } = await supabase
        .from('time_clock_alerts')
        .delete()
        .eq('id', alertId);
      if (error) throw error;
    } catch (err) {
      console.error('Error deleting alert:', err);
      await loadAlerts();
    }
  }

  async function saveEditedAlertClockIn(clockInTime?: string) {
    const timeToSave = clockInTime ?? editAlertClockInTime;
    if (!editAlertTime) return;

    setAlerts(prev => prev.filter(a => a.id !== editAlertTime.alertId));
    setProcessingAlert(editAlertTime.alertId);
    const capturedEditAlertTime = editAlertTime;
    setEditAlertTime(null);
    try {
      const { data: existingEntry } = await supabase
        .from('daily_clock_entries')
        .select('id')
        .eq('technician_id', capturedEditAlertTime.employeeId)
        .eq('entry_date', capturedEditAlertTime.alertDate)
        .maybeSingle();

      if (existingEntry) {
        const { error: resolveError } = await supabase
          .from('time_clock_alerts')
          .update({ resolved: true, resolved_at: new Date().toISOString() })
          .eq('id', capturedEditAlertTime.alertId);
        if (resolveError) throw resolveError;
        await Promise.all([loadAlerts(), loadEntries()]);
        return;
      }

      const clockInTimestamp = createTimestampInTimezone(
        capturedEditAlertTime.alertDate,
        timeToSave,
        orgTimezone
      );

      const { error: insertError } = await supabase
        .from('daily_clock_entries')
        .insert({
          technician_id: capturedEditAlertTime.employeeId,
          entry_date: capturedEditAlertTime.alertDate,
          clock_in: clockInTimestamp,
          status: 'clocked_in',
          admin_adjusted: true,
          adjustment_reason: 'Manually entered by admin'
        });
      if (insertError) throw insertError;

      const { error: resolveError } = await supabase
        .from('time_clock_alerts')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', capturedEditAlertTime.alertId);
      if (resolveError) throw resolveError;

      await Promise.all([loadAlerts(), loadEntries()]);
    } catch (err) {
      console.error('Error saving edited clock-in:', err);
      await loadAlerts();
    } finally {
      setProcessingAlert(null);
    }
  }

  async function checkPendingAutoClockOuts() {
    try {
      const { data, error } = await supabase
        .from('entries_pending_auto_clock_out')
        .select('*')
        .order('entry_date', { ascending: false })
        .order('clock_in', { ascending: false });

      if (error) {
        console.error('Error checking pending auto clock-outs:', error);
        throw error;
      }
      setPendingAutoClockOutEntries(data || []);
    } catch (error) {
      console.error('Error checking pending auto clock-outs:', error);
      // Set empty array so UI doesn't break
      setPendingAutoClockOutEntries([]);
    }
  }

  async function loadAutoClockOutsPendingApproval() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('daily_clock_entries')
        .select(`
          *,
          technician:profiles!technician_id(id, full_name, employment_type, standard_start_time)
        `)
        .eq('auto_clocked_out', true)
        .eq('auto_clock_out_approved', false)
        .gte('entry_date', thirtyDaysAgo)
        .order('entry_date', { ascending: false })
        .limit(100);

      if (error) throw error;
      setAutoClockOutsPendingApproval((data || []).map(e => ({ ...e, breaks: [] })));
    } catch (error) {
      console.error('Error loading auto clock-outs pending approval:', error);
      setAutoClockOutsPendingApproval([]);
    }
  }

  async function approveAutoClockOut(entryId: string) {
    setApprovingAutoClockOut(entryId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('daily_clock_entries')
        .update({
          auto_clock_out_approved: true,
          auto_clock_out_approved_by: user.id,
          auto_clock_out_approved_at: new Date().toISOString()
        })
        .eq('id', entryId);

      if (error) throw error;
      Promise.all([loadAutoClockOutsPendingApproval(), loadEntries()]);
    } catch (error) {
      console.error('Error approving auto clock-out:', error);
    } finally {
      setApprovingAutoClockOut(null);
    }
  }

  async function approveAllAutoClockOuts() {
    if (!autoClockOutsPendingApproval.length) return;
    setApprovingAutoClockOut('all');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const ids = autoClockOutsPendingApproval.map(e => e.id);
      const { error } = await supabase
        .from('daily_clock_entries')
        .update({
          auto_clock_out_approved: true,
          auto_clock_out_approved_by: user.id,
          auto_clock_out_approved_at: new Date().toISOString()
        })
        .in('id', ids);

      if (error) throw error;
      Promise.all([loadAutoClockOutsPendingApproval(), loadEntries()]);
    } catch (error) {
      console.error('Error approving all auto clock-outs:', error);
    } finally {
      setApprovingAutoClockOut(null);
    }
  }

  async function autoClockOutSingleEntry(entry: PendingAutoClockOut) {
    setProcessingClockOut(entry.id);
    try {
      // will_clock_out_at is already a full timestamp from the view
      const clockOutTime = new Date(entry.will_clock_out_at).toISOString();

      // Update the clock entry
      const { error: updateError } = await supabase
        .from('daily_clock_entries')
        .update({
          clock_out: clockOutTime,
          status: 'clocked_out',
          admin_adjusted: true,
          adjustment_reason: 'Auto-clocked out by admin: User forgot to clock out'
        })
        .eq('id', entry.id);

      if (updateError) throw updateError;

      const { data: settings } = await supabase
        .from('organizations')
        .select('forgot_clock_out_penalty_points')
        .limit(1)
        .maybeSingle();

      const penaltyPoints = settings?.forgot_clock_out_penalty_points || -15;

      // Create reward log entry with penalty
      await supabase
        .from('clock_in_rewards_log')
        .insert({
          technician_id: entry.technician_id,
          daily_clock_entry_id: entry.id,
          event_type: 'forgot_clock_out',
          points_awarded: penaltyPoints,
          minutes_delta: null,
          scheduled_time: null,
          actual_time: null
        });

      // Apply points penalty - fetch current points first
      const { data: profileData } = await supabase
        .from('profiles')
        .select('points_earned')
        .eq('id', entry.technician_id)
        .single();

      const currentPoints = profileData?.points_earned || 0;
      await supabase
        .from('profiles')
        .update({
          points_earned: currentPoints + penaltyPoints
        })
        .eq('id', entry.technician_id);

      // Create notification
      await supabase
        .from('notifications')
        .insert({
          user_id: entry.technician_id,
          type: 'system',
          title: 'Auto Clock-Out Applied',
          body: `You were automatically clocked out at ${formatTime12Hour(clockOutTime, orgTimezone)} because you forgot to clock out on ${formatLocalDate(entry.entry_date)}. Points penalty: ${penaltyPoints} points.`,
          related_id: entry.id
        });

      Promise.all([loadEntries(), loadAlerts(), checkPendingAutoClockOuts()]);
    } catch (error) {
      console.error('Error auto-clocking out entry:', error);
      alert('Failed to auto clock-out entry');
    } finally {
      setProcessingClockOut(null);
    }
  }

  function editClockOutTime(entry: PendingAutoClockOut) {
    // Find the full entry with breaks
    const fullEntry = entries.find(e => e.id === entry.id);
    if (fullEntry) {
      setEditingEntry(fullEntry);
      setShowManualEntry(true);
    }
  }

  async function approveOfflineEntry(entryId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('daily_clock_entries')
        .update({
          admin_reviewed: true,
          admin_reviewed_by: user.id,
          admin_reviewed_at: new Date().toISOString(),
          admin_notes: offlineReviewNotes || null
        })
        .eq('id', entryId);

      if (error) throw error;

      setReviewingOfflineEntry(null);
      setOfflineReviewNotes('');
      Promise.all([loadEntries()]);
    } catch (error) {
      console.error('Error approving offline entry:', error);
      alert('Failed to approve offline entry');
    }
  }

  async function deleteEntry(entry: ClockEntry) {
    setDeletingClockId(entry.id);
    try {
      const { error } = await supabase
        .from('daily_clock_entries')
        .delete()
        .eq('id', entry.id);

      if (error) throw error;

      setEntries(prev => prev.filter(e => e.id !== entry.id));
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry. You may not have permission to delete time entries.');
    } finally {
      setDeletingClockId(null);
    }
  }

  async function loadEntries(isInitial = false) {
    try {
      setLoading(true);

      // Build the base query
      let query = supabase
        .from('daily_clock_entries')
        .select(`
          *,
          technician:profiles!technician_id(id, full_name, employment_type, standard_start_time)
        `)
        .order('entry_date', { ascending: false })
        .order('clock_in', { ascending: false })
        .limit(500); // Add reasonable limit for performance

      // Apply employee filter
      if (selectedEmployee !== 'all') {
        query = query.eq('technician_id', selectedEmployee);
      }

      // Apply date range filter
      if (dateRange === 'today') {
        const today = new Date().toISOString().split('T')[0];
        query = query.eq('entry_date', today);
      } else if (dateRange === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        query = query.eq('entry_date', yesterday.toISOString().split('T')[0]);
      } else if (dateRange === 'this_week') {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayOffset);
        const mondayStr = monday.toISOString().split('T')[0];
        query = query.gte('entry_date', mondayStr);
      } else if (dateRange === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte('entry_date', weekAgo.toISOString().split('T')[0]);
      } else if (dateRange === 'month') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        query = query.gte('entry_date', monthAgo.toISOString().split('T')[0]);
      } else if (dateRange === 'custom') {
        query = query.gte('entry_date', startDate).lte('entry_date', endDate);
      }

      // Fetch entries first
      const { data, error } = await query;

      if (error) {
        console.error('Error loading entries:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        setEntries([]);
        return;
      }

      // Fetch breaks only for the entries we got (more efficient)
      const entryIds = data.map(e => e.id);
      const { data: breaksData } = await supabase
        .from('daily_clock_breaks')
        .select('*')
        .in('daily_clock_entry_id', entryIds)
        .order('break_start', { ascending: true });

      // Create a map for fast break lookup
      const breaksMap = new Map();
      breaksData?.forEach(breakItem => {
        const entryBreaks = breaksMap.get(breakItem.daily_clock_entry_id) || [];
        entryBreaks.push(breakItem);
        breaksMap.set(breakItem.daily_clock_entry_id, entryBreaks);
      });

      // Combine entries with their breaks using the map
      const entriesWithBreaks = data.map(entry => ({
        ...entry,
        breaks: breaksMap.get(entry.id) || []
      }));

      setEntries(entriesWithBreaks);
    } catch (error) {
      console.error('Error loading entries:', error);
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'clocked_in':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'clocked_out':
        return <CheckCircle className="w-4 h-4 text-gray-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'submitted':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'clocked_out':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'clocked_in':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  type ClockInStatus = 'early' | 'on-time' | 'late' | 'really-late';

  function getClockInStatus(entry: ClockEntry): ClockInStatus | null {
    if (!entry.technician?.standard_start_time || !entry.clock_in) return null;

    const scheduledStart = entry.technician.standard_start_time;
    const clockInTime = new Date(entry.clock_in).toTimeString().slice(0, 8);

    // Parse times
    const [schedHour, schedMin] = scheduledStart.split(':').map(Number);
    const [clockHour, clockMin, clockSec] = clockInTime.split(':').map(Number);

    // Convert to minutes for comparison
    const scheduledMinutes = schedHour * 60 + schedMin;
    const clockInMinutes = clockHour * 60 + clockMin;

    const diffMinutes = clockInMinutes - scheduledMinutes;

    if (diffMinutes < -15) return 'early';
    if (diffMinutes <= 0) return 'on-time';
    if (diffMinutes <= 15) return 'late';
    return 'really-late';
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

  function getClockInStatusDisplay(status: ClockInStatus | null, minutesLate: number) {
    if (!status) return null;

    switch (status) {
      case 'early':
        return {
          icon: <Check className="w-4 h-4 text-blue-500" />,
          badge: <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Early ({formatMinutesLate(minutesLate)})</span>,
          bgClass: 'bg-blue-50'
        };
      case 'on-time':
        return {
          icon: <CheckCircle className="w-4 h-4 text-green-500" />,
          badge: <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">On Time</span>,
          bgClass: ''
        };
      case 'late':
        return {
          icon: <Clock className="w-4 h-4 text-orange-500" />,
          badge: <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">Late ({formatMinutesLate(minutesLate)})</span>,
          bgClass: 'bg-orange-50'
        };
      case 'really-late':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
          badge: <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Really Late ({formatMinutesLate(minutesLate)})</span>,
          bgClass: 'bg-red-50'
        };
    }
  }

  function calculateMinutesLate(entry: ClockEntry): number {
    if (!entry.technician?.standard_start_time || !entry.clock_in) return 0;

    const scheduledStart = entry.technician.standard_start_time;
    const clockInTime = new Date(entry.clock_in).toTimeString().slice(0, 8);

    const [schedHour, schedMin] = scheduledStart.split(':').map(Number);
    const [clockHour, clockMin] = clockInTime.split(':').map(Number);

    const scheduledMinutes = schedHour * 60 + schedMin;
    const clockInMinutes = clockHour * 60 + clockMin;

    return clockInMinutes - scheduledMinutes;
  }

  function calculateElapsedHours(entry: ClockEntry): number {
    if (!entry.clock_in) return 0;

    // If already clocked out, use the stored total_hours
    if (entry.clock_out) {
      return entry.total_hours || 0;
    }

    // Calculate elapsed time from clock_in to now
    const clockInTime = new Date(entry.clock_in).getTime();
    const now = Date.now();
    const elapsedMs = now - clockInTime;
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    // Subtract break time if any
    const breakHours = (entry.break_minutes || 0) / 60;

    return Math.max(0, elapsedHours - breakHours);
  }

  const filteredEntries = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return entries.filter(entry => {
      const matchesSearch = !searchTerm || entry.technician?.full_name.toLowerCase().includes(searchLower);
      const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
      const matchesRequestFilter = !showOnlyPendingRequests || pendingRequests[entry.id] > 0;
      return matchesSearch && matchesStatus && matchesRequestFilter;
    });
  }, [entries, searchTerm, statusFilter, showOnlyPendingRequests, pendingRequests]);

  // Weekly overtime: group ALL entries (not just filtered) by employee+week, compute 40h threshold
  // Returns a map of entry.id -> { regularHours, overtimeHours }
  const overtimeByEntry = useMemo(() => {
    // Group by technician_id + ISO week key (Mon–Sun)
    const weekGroups = new Map<string, ClockEntry[]>();
    for (const entry of entries) {
      const d = parseLocalDate(entry.entry_date);
      const dow = d.getDay(); // 0=Sun
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(d);
      monday.setDate(d.getDate() + mondayOffset);
      const weekKey = `${entry.technician_id}::${monday.toISOString().split('T')[0]}`;
      const group = weekGroups.get(weekKey) || [];
      group.push(entry);
      weekGroups.set(weekKey, group);
    }

    const result = new Map<string, { regularHours: number; overtimeHours: number }>();

    weekGroups.forEach((group) => {
      // Sort by entry_date ascending so earlier days consume regular hours first
      const sorted = [...group].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
      let accumulatedHours = 0;
      for (const entry of sorted) {
        const hours = entry.total_hours || 0;
        const regularSoFar = Math.min(accumulatedHours, 40);
        const regularAfter = Math.min(accumulatedHours + hours, 40);
        const regularHours = regularAfter - regularSoFar;
        const overtimeHours = hours - regularHours;
        result.set(entry.id, { regularHours, overtimeHours: Math.max(0, overtimeHours) });
        accumulatedHours += hours;
      }
    });

    return result;
  }, [entries]);

  // Totals across filtered entries using weekly overtime bucketing
  const filteredTotals = useMemo(() => {
    let totalHours = 0;
    let regularHours = 0;
    let overtimeHours = 0;
    for (const entry of filteredEntries) {
      const h = calculateElapsedHours(entry);
      totalHours += h;
      const ot = overtimeByEntry.get(entry.id);
      if (ot) {
        regularHours += ot.regularHours;
        overtimeHours += ot.overtimeHours;
      } else {
        regularHours += h;
      }
    }
    return { totalHours, regularHours, overtimeHours };
  }, [filteredEntries, overtimeByEntry]);

  const statusCounts = useMemo(() => {
    const counts = {
      all: entries.length,
      clocked_in: 0,
      clocked_out: 0,
      submitted: 0,
      approved: 0,
      early: 0,
      on_time: 0,
      late: 0,
      really_late: 0
    };
    for (const e of entries) {
      if (e.status === 'clocked_in') counts.clocked_in++;
      else if (e.status === 'clocked_out') counts.clocked_out++;
      else if (e.status === 'submitted') counts.submitted++;
      else if (e.status === 'approved') counts.approved++;
      const s = getClockInStatus(e);
      if (s === 'early') counts.early++;
      else if (s === 'on-time') counts.on_time++;
      else if (s === 'late') counts.late++;
      else if (s === 'really-late') counts.really_late++;
    }
    return counts;
  }, [entries]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading time clock history...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">Time Clock History</h2>
          {refreshing && activeTab === 'clock' && <span className="text-xs text-gray-400 animate-pulse">Updating...</span>}
        </div>
        <div className="flex items-center gap-2">
          {onNavigate && (
            <button
              onClick={() => onNavigate('tech_stats')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 hover:text-white rounded-lg text-sm font-medium transition-colors"
              title="View Tech Efficiency Stats"
            >
              <BarChart3 className="w-4 h-4" />
              Efficiency Stats
            </button>
          )}
          {activeTab === 'clock' && (
            <>
              <button
                onClick={() => setShowCSVTutorial(true)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="CSV Import Tutorial"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowCSVImport(true)}
                className="px-3 py-1.5 bg-gray-700 text-gray-200 border border-gray-600 rounded hover:bg-gray-600 hover:text-white flex items-center gap-1.5 text-sm transition-colors"
                title="Import daily clock/shift time from CSV"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
              <button
                onClick={() => setShowManualEntry(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1.5 text-sm transition-colors"
                title="Add manual daily clock entry"
              >
                <Clock className="w-4 h-4" />
                Add Entry
              </button>
            </>
          )}
          {activeTab === 'job_time' && (
            <>
              <button
                onClick={() => setShowJobTimeImport(true)}
                className="px-3 py-1.5 bg-gray-700 text-gray-200 border border-gray-600 rounded hover:bg-gray-600 hover:text-white flex items-center gap-1.5 text-sm transition-colors"
                title="Import job time from CSV"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
              <button
                onClick={() => setShowManualJobEntry(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1.5 text-sm transition-colors"
                title="Add manual job time entry"
              >
                <Briefcase className="w-4 h-4" />
                Add Entry
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 border border-gray-700 w-fit">
        <button
          onClick={() => setActiveTab('clock')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'clock'
              ? 'bg-gray-700 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          Clock History
        </button>
        <button
          onClick={() => setActiveTab('job_time')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'job_time'
              ? 'bg-gray-700 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          <LayoutList className="w-4 h-4" />
          Job Time History
        </button>
        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'sessions'
              ? 'bg-gray-700 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          <Wrench className="w-4 h-4" />
          Shop &amp; Training
        </button>
      </div>

      {/* Job Time History Tab */}
      {activeTab === 'job_time' && <JobTimeHistory />}

      {/* Internal Sessions Management Tab */}
      {activeTab === 'sessions' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <InternalSessionsManagement />
        </div>
      )}

      {/* Clock History Tab content (rendered only when active) */}
      {activeTab === 'clock' && <>


      {showManualEntry && (
        <ManualTimeEntry
          entryToEdit={editingEntry}
          onClose={() => {
            setShowManualEntry(false);
            setEditingEntry(null);
          }}
          onSave={() => {
            Promise.all([loadEntries(), loadAlerts(), checkPendingAutoClockOuts()]);
          }}
        />
      )}

      {/* Auto Clock-Outs Awaiting Approval */}
      {autoClockOutsPendingApproval.length > 0 && (
        <div className="bg-amber-900/30 border border-amber-500 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-200">
                Auto Clock-Outs Awaiting Approval ({autoClockOutsPendingApproval.length})
              </h3>
            </div>
            <button
              onClick={approveAllAutoClockOuts}
              disabled={approvingAutoClockOut === 'all'}
              className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <Check className="w-3 h-3" />
              {approvingAutoClockOut === 'all' ? 'Approving...' : 'Approve All'}
            </button>
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {autoClockOutsPendingApproval.map(entry => (
              <div key={entry.id} className="bg-white rounded p-2 flex items-center justify-between gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{entry.technician?.full_name}</div>
                  <div className="text-xs text-gray-600">
                    {formatLocalDate(entry.entry_date)}: {formatTime12Hour(entry.clock_in, orgTimezone)} - {entry.clock_out ? formatTime12Hour(entry.clock_out, orgTimezone) : '—'}
                    <span className="font-medium ml-1">({entry.total_hours?.toFixed(2) || '0'}h)</span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      setEditingEntry(entry);
                      setShowManualEntry(true);
                    }}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded flex items-center gap-1 transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => approveAutoClockOut(entry.id)}
                    disabled={approvingAutoClockOut === entry.id}
                    className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" />
                    {approvingAutoClockOut === entry.id ? '...' : 'Approve'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Still Clocked In - Informational */}
      {pendingAutoClockOutEntries.length > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-semibold text-yellow-200">
              Still Clocked In ({pendingAutoClockOutEntries.length})
            </h3>
            <span className="text-xs text-yellow-300/70">Will be auto-clocked out at cutoff time</span>
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {pendingAutoClockOutEntries.map(entry => (
              <div key={entry.id} className="bg-white rounded p-2 flex items-center justify-between gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{entry.full_name}</div>
                  <div className="text-xs text-gray-600">
                    In: {formatLocalDate(entry.entry_date)} {formatTime12Hour(entry.clock_in, orgTimezone)}
                    <span className="text-orange-600 font-medium ml-1">
                      ({Math.floor(entry.hours_since_clock_in)}h)
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setConfirmAutoClockOutEntry(entry)}
                    disabled={processingClockOut === entry.id}
                    className="px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                    title="Clock out now"
                  >
                    <Clock className="w-3 h-3" />
                    {processingClockOut === entry.id ? '...' : 'Clock Out'}
                  </button>
                  <button
                    onClick={() => editClockOutTime(entry)}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded flex items-center gap-1 transition-colors"
                    title="Edit manually"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Alert Time Modal */}
      {editAlertTime && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Set Clock-In Time</h3>
                <p className="text-xs text-gray-500 mt-0.5">{getTimezoneLabel(orgTimezone)}</p>
              </div>
              <button
                onClick={() => { setEditAlertTime(null); setEditAlertClockInTime(''); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{editAlertTime.employeeName}</div>
                  <div className="text-xs text-gray-500">{formatLocalDate(editAlertTime.alertDate)}</div>
                </div>
              </div>

              <TimePicker
                label="Clock-In Time"
                required
                value={editAlertClockInTime}
                onChange={setEditAlertClockInTime}
                presets={[
                  { label: '6:00 AM', value: '06:00' },
                  { label: '7:00 AM', value: '07:00' },
                  { label: '7:30 AM', value: '07:30' },
                  { label: '8:00 AM', value: '08:00' },
                  { label: '8:30 AM', value: '08:30' },
                  { label: '9:00 AM', value: '09:00' },
                ]}
              />

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Time will be recorded in <span className="font-medium">{getTimezoneLabel(orgTimezone)}</span>
                </p>
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => { setEditAlertTime(null); setEditAlertClockInTime(''); }}
                disabled={processingAlert === editAlertTime.alertId}
                className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editAlertClockInTime) {
                    saveEditedAlertClockIn();
                  }
                }}
                disabled={!editAlertClockInTime || processingAlert === editAlertTime.alertId}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
              >
                {processingAlert === editAlertTime.alertId ? 'Saving...' : 'Save Clock-In'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Entries Needing Review Section */}
      {entries.filter(e => e.offline_entry && !e.admin_reviewed).length > 0 && (
        <div className="bg-orange-900/30 border border-orange-500 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertCircle className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-orange-200">
              Offline Entries ({entries.filter(e => e.offline_entry && !e.admin_reviewed).length})
            </h3>
          </div>
          <div className="space-y-1.5">
            {entries.filter(e => e.offline_entry && !e.admin_reviewed).map(entry => (
              <div key={entry.id} className="bg-white rounded p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{entry.technician.full_name}</div>
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <div>{formatLocalDate(entry.entry_date)}: {formatTime12Hour(entry.clock_in, orgTimezone)} - {entry.clock_out ? formatTime12Hour(entry.clock_out, orgTimezone) : 'Active'} ({entry.total_hours?.toFixed(2)}h)</div>
                      {!entry.clock_in_latitude && <span className="text-orange-600">(No GPS)</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {reviewingOfflineEntry === entry.id ? (
                      <div className="bg-gray-50 p-2 rounded space-y-1.5">
                        <textarea
                          value={offlineReviewNotes}
                          onChange={(e) => setOfflineReviewNotes(e.target.value)}
                          placeholder="Notes (optional)..."
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 resize-none"
                          rows={2}
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              setReviewingOfflineEntry(null);
                              setOfflineReviewNotes('');
                            }}
                            className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => approveOfflineEntry(entry.id)}
                            className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            Approve
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingEntry(entry);
                            setShowManualEntry(true);
                          }}
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setReviewingOfflineEntry(entry.id)}
                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="bg-red-900/30 border border-red-500 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-red-200">
                Clock-In Alerts ({alerts.length})
              </h3>
            </div>
            <button
              onClick={approveAllAlerts}
              disabled={processingAlert === 'all'}
              className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <Check className="w-3 h-3" />
              {processingAlert === 'all' ? 'Approving...' : 'Approve All'}
            </button>
          </div>
          <div className="space-y-1.5">
            {alerts.map(alert => (
              <div key={alert.id} className="bg-white rounded p-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">
                      {alert.technician.full_name}
                    </div>
                    <div className="text-xs text-gray-600 truncate flex items-center gap-1">
                      {alert.alert_type === 'really_late' ? (
                        <>
                          <span>{formatLocalDate(alert.alert_date)} - Late: {alert.actual_clock_in_time ? formatTime12Hour(createTimestampInTimezone(alert.alert_date, alert.actual_clock_in_time, orgTimezone), orgTimezone) : 'N/A'} ({formatMinutesLate(alert.minutes_late)})</span>
                          {alert.has_gps && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingAlertGPS(alert);
                              }}
                              className="text-green-500 hover:text-green-600 transition-colors"
                              title="View GPS location"
                            >
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                            </button>
                          )}
                        </>
                      ) : alert.alert_type === 'missing' ? (
                        <>
                          {formatLocalDate(alert.alert_date)} - Missing (Sched: {formatTime12Hour(createTimestampInTimezone(alert.alert_date, alert.scheduled_start_time, orgTimezone), orgTimezone)})
                        </>
                      ) : (
                        <>
                          {formatLocalDate(alert.alert_date)} - No show
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => {
                      const suggested = alert.actual_clock_in_time || alert.scheduled_start_time;
                      setEditAlertTime({
                        alertId: alert.id,
                        employeeId: alert.technician_id,
                        employeeName: alert.technician.full_name,
                        alertDate: alert.alert_date,
                        suggestedTime: suggested
                      });
                      setEditAlertClockInTime(suggested || '');
                    }}
                    disabled={processingAlert === alert.id}
                    className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  {alert.actual_clock_in_time && (
                    <button
                      onClick={() => approveAlertClockIn(alert)}
                      disabled={processingAlert === alert.id}
                      className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      {processingAlert === alert.id ? '...' : 'OK'}
                    </button>
                  )}
                  <button
                    onClick={() => deleteAlert(alert.id)}
                    disabled={processingAlert === alert.id}
                    className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                    title="Delete this alert"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-white rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Employee Filter */}
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-white rounded focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.full_name}</option>
            ))}
          </select>

          {/* Date Range */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-white rounded focus:ring-1 focus:ring-blue-500"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This Week</option>
            <option value="week">Past Week</option>
            <option value="month">Past Month</option>
            <option value="custom">Custom</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-white rounded focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="clocked_in">Clocked In</option>
            <option value="clocked_out">Clocked Out</option>
          </select>

          {/* Pending Requests Toggle */}
          <button
            onClick={() => setShowOnlyPendingRequests(!showOnlyPendingRequests)}
            className={`px-2.5 py-1.5 text-sm rounded flex items-center gap-1.5 transition-colors ${
              showOnlyPendingRequests
                ? 'bg-orange-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            Pending
            {Object.keys(pendingRequests).length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-orange-500 text-white">
                {Object.keys(pendingRequests).length}
              </span>
            )}
          </button>

          {/* Quick Stats - Inline */}
          <div className="flex items-center gap-2 ml-auto text-xs">
            <span className="text-gray-400">Total: <span className="font-bold text-white">{statusCounts.all}</span></span>
            <span className="text-blue-300">Early: <span className="font-bold">{statusCounts.early}</span></span>
            <span className="text-green-300">On Time: <span className="font-bold">{statusCounts.on_time}</span></span>
            <span className="text-orange-300">Late: <span className="font-bold">{statusCounts.late}</span></span>
            <span className="text-red-300">Really Late: <span className="font-bold">{statusCounts.really_late}</span></span>
          </div>
        </div>

        {/* Custom Date Range */}
        {dateRange === 'custom' && (
          <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-white rounded focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-gray-400 text-sm py-1.5">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-white rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* Record Count Notice */}
      {filteredEntries.length >= 500 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-sm text-blue-800">
          <AlertCircle className="w-4 h-4 inline mr-1" />
          Showing 500 most recent entries. Use filters to narrow your search.
        </div>
      )}

      {/* Hours Summary Bar */}
      {filteredEntries.length > 0 && (
        <div className="flex items-center gap-4 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm">
          <span className="text-gray-400 text-xs font-medium uppercase tracking-wide">Hours Summary</span>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 text-xs">Total:</span>
            <span className="font-bold text-white">{filteredTotals.totalHours.toFixed(1)}h</span>
          </div>
          <div className="w-px h-4 bg-gray-600" />
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 text-xs">Regular:</span>
            <span className="font-bold text-green-300">{filteredTotals.regularHours.toFixed(1)}h</span>
          </div>
          {filteredTotals.overtimeHours > 0 && (
            <>
              <div className="w-px h-4 bg-gray-600" />
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-xs">Overtime:</span>
                <span className="font-bold text-orange-400">{filteredTotals.overtimeHours.toFixed(1)}h</span>
              </div>
            </>
          )}
          <span className="ml-auto text-xs text-gray-500">Based on 40h/week (Mon–Sun) per employee</span>
        </div>
      )}

      {/* Entries Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Employee</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Date</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">In</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Out</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Hours</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Status</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-sm text-gray-500">
                    No entries found
                  </td>
                </tr>
              ) : (
                filteredEntries.map(entry => {
                  const clockInStatus = getClockInStatus(entry);
                  const minutesLate = calculateMinutesLate(entry);
                  const statusDisplay = getClockInStatusDisplay(clockInStatus, minutesLate);
                  const hasPendingRequest = pendingRequests[entry.id] > 0;

                  return (
                  <tr
                    key={entry.id}
                    className={`hover:bg-gray-50 ${hasPendingRequest ? 'border-l-2 border-l-orange-500' : ''}`}
                  >
                    <td className="px-2 py-1.5">
                      <div className="text-sm font-medium text-gray-900 truncate">{entry.technician?.full_name}</div>
                      {statusDisplay && (
                        <span className={`text-[11px] ${clockInStatus === 'early' ? 'text-blue-600' : clockInStatus === 'on-time' ? 'text-green-600' : clockInStatus === 'late' ? 'text-orange-600' : 'text-red-600'}`}>
                          {clockInStatus === 'early' ? `${formatMinutesLate(minutesLate)} early` :
                           clockInStatus === 'on-time' ? 'On time' :
                           `${formatMinutesLate(minutesLate)} late`}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-700">{formatLocalDate(entry.entry_date)}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-0.5">
                        <span className="text-xs text-gray-900 font-medium">{formatTime12Hour(entry.clock_in, orgTimezone)}</span>
                        {entry.clock_in_latitude && (
                          <button
                            onClick={() => setViewingGPSEntry(entry)}
                            className="text-green-500 hover:text-green-600 transition-colors"
                            title="View GPS clock-in location"
                          >
                            <MapPin className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      {entry.clock_out ? (
                        <div className="flex items-center gap-0.5">
                          <span className="text-xs text-gray-900 font-medium">{formatTime12Hour(entry.clock_out, orgTimezone)}</span>
                          {entry.clock_out_latitude && (
                            <button
                              onClick={() => setViewingGPSEntry(entry)}
                              className="text-green-500 hover:text-green-600 transition-colors"
                              title="View GPS clock-out location"
                            >
                              <MapPin className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-blue-600 font-semibold">Active</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold text-gray-900">{calculateElapsedHours(entry).toFixed(2)}h</span>
                        {!entry.clock_out && <span className="text-[10px] text-blue-600 font-medium">(live)</span>}
                      </div>
                      {entry.break_minutes > 0 && <span className="text-[11px] text-gray-400">({entry.break_minutes}m brk)</span>}
                      {(() => {
                        const ot = overtimeByEntry.get(entry.id);
                        if (ot && ot.overtimeHours > 0) {
                          return (
                            <div className="text-[11px] text-orange-600 font-semibold">
                              +{ot.overtimeHours.toFixed(2)}h OT
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium border ${getStatusColor(entry.status)}`}>
                          {entry.status === 'clocked_in' ? 'In' : entry.status === 'clocked_out' ? 'Out' : entry.status}
                        </span>
                        {entry.auto_clocked_out && !entry.auto_clock_out_approved && (
                          <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-300">Pending</span>
                        )}
                        {entry.auto_clocked_out && entry.auto_clock_out_approved && (
                          <CheckCircle className="w-3 h-3 text-green-500" title="Approved" />
                        )}
                        {entry.admin_adjusted && <AlertCircle className="w-3 h-3 text-yellow-600" title="Admin adjusted" />}
                        {entry.offline_entry && !entry.admin_reviewed && <AlertCircle className="w-3 h-3 text-orange-600" title="Offline" />}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-0.5">
                        {hasPendingRequest && (
                          <button
                            onClick={() => setReviewingRequestEntryId(entry.id)}
                            className="relative p-1 text-orange-600 hover:bg-orange-50 rounded transition-colors"
                            title="Review request"
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {profile?.role === 'tech' && entry.technician_id === profile?.id && !pendingRequests[entry.id] && (
                          <button
                            onClick={() => setRequestingAdjustmentEntry(entry)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Request adjustment"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(entry.clock_in_latitude || entry.clock_out_latitude) && (
                          <button
                            onClick={() => setViewingGPSEntry(entry)}
                            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="View GPS"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(profile?.role === 'admin' || profile?.role !== 'tech') && (
                          <>
                            <button
                              onClick={() => {
                                setEditingEntry(entry);
                                setShowManualEntry(true);
                              }}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteClockEntry(entry)}
                              disabled={deletingClockId === entry.id}
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reviewingRequestEntryId && (
        <RequestReviewModal
          entryId={reviewingRequestEntryId}
          onClose={() => setReviewingRequestEntryId(null)}
          onReviewed={() => {
            loadEntries();
            loadAlerts();
            checkPendingAutoClockOuts();
            loadPendingRequests();
          }}
        />
      )}

      {requestingAdjustmentEntry && (
        <TimeAdjustmentRequestModal
          entry={requestingAdjustmentEntry}
          onClose={() => setRequestingAdjustmentEntry(null)}
          onSubmit={() => {
            setRequestingAdjustmentEntry(null);
            loadPendingRequests();
          }}
        />
      )}

      {viewingGPSEntry && (
        <GPSHistoryModal
          entry={viewingGPSEntry}
          technicianName={viewingGPSEntry.technician.full_name}
          onClose={() => setViewingGPSEntry(null)}
        />
      )}

      {/* CSV Import Tutorial Modal */}
      {showCSVTutorial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HelpCircle className="w-6 h-6 text-blue-600" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">CSV Import Tutorial</h3>
                  <p className="text-sm text-gray-600">Learn how to import time clock data from CSV files</p>
                </div>
              </div>
              <button
                onClick={() => setShowCSVTutorial(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Overview */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Two CSV Formats Supported
                </h4>
                <p className="text-sm text-gray-600 mb-4">
                  The system automatically detects and handles two different CSV formats. Choose the one that matches your data.
                </p>
              </div>

              {/* Format 1: Hours Only */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h5 className="font-semibold text-blue-900 mb-2">Format 1: Hours Only</h5>
                <p className="text-sm text-blue-800 mb-3">
                  Use this when you only have total hours worked, not specific clock in/out times.
                </p>
                <div className="bg-white rounded-lg p-4 mb-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">CSV Structure:</p>
                  <code className="block text-sm font-mono bg-gray-50 p-3 rounded border border-gray-200">
                    Employee,Date,Hours<br />
                    Justin Wright,2026-01-05,8.00<br />
                    Sarah Johnson,2026-01-05,7.50<br />
                    Mike Davis,2026-01-06,8.50
                  </code>
                </div>
                <div className="space-y-2 text-sm text-blue-800">
                  <p className="font-medium">How it works:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>System generates clock in time using default start time (e.g., 8:00 AM)</li>
                    <li>Clock out time is calculated by adding hours to clock in time</li>
                    <li>Example: 8.00 hours with 8:00 AM start = 8:00 AM to 4:00 PM</li>
                  </ul>
                </div>
              </div>

              {/* Format 2: Full Times */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h5 className="font-semibold text-green-900 mb-2">Format 2: Full Times</h5>
                <p className="text-sm text-green-800 mb-3">
                  Use this when you have actual clock in and clock out timestamps.
                </p>
                <div className="bg-white rounded-lg p-4 mb-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">CSV Structure:</p>
                  <code className="block text-sm font-mono bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto">
                    Employee,Date,Clock In,Clock Out<br />
                    Justin Wright,1/5/2026,1/5/2026 9:42:42 AM,1/5/2026 12:07:37 PM<br />
                    Sarah Johnson,1/5/2026,1/5/2026 8:00:00 AM,1/5/2026 4:30:00 PM<br />
                    Mike Davis,1/6/2026,1/6/2026 7:45:00 AM,1/6/2026 5:15:00 PM
                  </code>
                </div>
                <div className="space-y-2 text-sm text-green-800">
                  <p className="font-medium">How it works:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>System uses the exact times provided in your CSV</li>
                    <li>Automatically calculates total hours from the time difference</li>
                    <li>More accurate for irregular schedules and overtime</li>
                  </ul>
                </div>
              </div>

              {/* Step by Step */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Step-by-Step Import Process</h4>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">1</div>
                    <div>
                      <p className="font-medium text-gray-900">Upload CSV File</p>
                      <p className="text-sm text-gray-600">Click "Import CSV" button and select your file. System automatically detects format.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">2</div>
                    <div>
                      <p className="font-medium text-gray-900">Set Default Start Time (Hours Format Only)</p>
                      <p className="text-sm text-gray-600">If using hours-only format, set default start time (e.g., 8:00 AM) to generate clock times.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">3</div>
                    <div>
                      <p className="font-medium text-gray-900">Preview & Validate</p>
                      <p className="text-sm text-gray-600">Review all rows. System validates employees, dates, and hours. Errors shown in red.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">4</div>
                    <div>
                      <p className="font-medium text-gray-900">Import Data</p>
                      <p className="text-sm text-gray-600">Click "Import" button. All entries marked as admin-adjusted with audit trail.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column Names */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 mb-2">Flexible Column Names</h5>
                <p className="text-sm text-gray-600 mb-3">System recognizes these column name variations:</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Employee:</p>
                    <p className="text-gray-600">Employee, Name, Technician, Tech</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Date:</p>
                    <p className="text-gray-600">Date, Day</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Hours:</p>
                    <p className="text-gray-600">Hours, Total Hours, Hours Worked</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Times:</p>
                    <p className="text-gray-600">Clock In/Out, Time In/Out, Start/End Time</p>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h5 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Important Tips
                </h5>
                <ul className="space-y-2 text-sm text-amber-800">
                  <li className="flex gap-2">
                    <span className="text-amber-600">•</span>
                    <span>Employee names must match exactly with system records (or use email address)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600">•</span>
                    <span>Test with 5-10 records first before bulk importing</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600">•</span>
                    <span>All imports are marked as admin-adjusted for audit trail</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600">•</span>
                    <span>Duplicate entries (same employee + date) will be updated, not duplicated</span>
                  </li>
                </ul>
              </div>

              {/* Download Templates */}
              <div className="text-center">
                <button
                  onClick={() => {
                    const hoursTemplate = 'Employee,Date,Hours\nJohn Doe,2026-01-15,8.00\nJane Smith,2026-01-15,7.50';
                    const timesTemplate = 'Employee,Date,Clock In,Clock Out\nJohn Doe,1/15/2026,1/15/2026 8:00:00 AM,1/15/2026 4:30:00 PM\nJane Smith,1/15/2026,1/15/2026 9:00:00 AM,1/15/2026 5:00:00 PM';
                    const template = `Hours Format:\n${hoursTemplate}\n\nTimes Format:\n${timesTemplate}`;
                    const blob = new Blob([template], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'timeclock_import_template.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors mx-auto"
                >
                  <Download className="w-4 h-4" />
                  Download CSV Templates
                </button>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  setShowCSVTutorial(false);
                  setShowCSVImport(true);
                }}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                Got it! Open Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCSVImport && (
        <TimeClockCSVImport
          onClose={() => setShowCSVImport(false)}
          onImportComplete={() => {
            loadEntries();
            setShowCSVImport(false);
          }}
        />
      )}

      {/* GPS Location Modal for Late Clock-In Alerts */}
      {viewingAlertGPS && viewingAlertGPS.gps_entry && (
        <GPSHistoryModal
          entry={viewingAlertGPS.gps_entry}
          technicianName={viewingAlertGPS.technician.full_name}
          onClose={() => setViewingAlertGPS(null)}
        />
      )}
      </>}

      {/* Job Time Entry Modal — available from either tab */}
      {showManualJobEntry && (
        <ManualJobTimeEntry
          onClose={() => setShowManualJobEntry(false)}
          onSave={() => {
            Promise.all([loadEntries(), loadAlerts(), checkPendingAutoClockOuts()]);
          }}
        />
      )}

      {/* Job Time Import Modal — available from either tab */}
      {showJobTimeImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Import Job Time from CSV</h2>
              <button
                onClick={() => setShowJobTimeImport(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <JobTimeCSVImport />
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteClockEntry !== null}
        title="Delete Time Entry"
        message={confirmDeleteClockEntry ? `Are you sure you want to delete this time entry?\n\nEmployee: ${confirmDeleteClockEntry.technician?.full_name}\nDate: ${formatLocalDate(confirmDeleteClockEntry.entry_date)}\nTime: ${new Date(confirmDeleteClockEntry.clock_in).toLocaleTimeString()} - ${confirmDeleteClockEntry.clock_out ? new Date(confirmDeleteClockEntry.clock_out).toLocaleTimeString() : 'Active'}\n\nThis action cannot be undone.` : ''}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteClockEntry) {
            deleteEntry(confirmDeleteClockEntry);
          }
          setConfirmDeleteClockEntry(null);
        }}
        onCancel={() => setConfirmDeleteClockEntry(null)}
      />

      <ConfirmModal
        isOpen={confirmAutoClockOutEntry !== null}
        title="Clock Out Employee"
        message={confirmAutoClockOutEntry ? `Clock out ${confirmAutoClockOutEntry.full_name} at ${confirmAutoClockOutEntry.will_clock_out_at}?` : ''}
        variant="warning"
        confirmLabel="Clock Out"
        onConfirm={() => {
          if (confirmAutoClockOutEntry) {
            autoClockOutSingleEntry(confirmAutoClockOutEntry);
          }
          setConfirmAutoClockOutEntry(null);
        }}
        onCancel={() => setConfirmAutoClockOutEntry(null)}
      />
    </div>
  );
}
