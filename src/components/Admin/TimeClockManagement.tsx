import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Clock, Power, AlertCircle, RefreshCw, Save, MapPin, CheckCircle, Flag, Eye, Upload, HelpCircle, X, FileText, Download, Wrench, BookOpen, ToggleLeft, ToggleRight, Bell, User, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { TimeClockCSVImport } from './TimeClockCSVImport';
import { formatTimeInTimezone, getOrganizationTimezone } from '../../lib/timezoneUtils';
import ConfirmModal from '../ui/ConfirmModal';

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

interface HomeClockEvent {
  id: string;
  technician_id: string;
  technician_name: string;
  technician_email: string;
  entry_date: string;
  clock_in: string | null;
  clock_out: string | null;
  clock_in_address: string | null;
  clock_out_address: string | null;
  clocked_in_from_home: boolean;
  clocked_out_from_home: boolean;
  home_clock_review_status: 'pending' | 'reviewed' | 'approved' | 'flagged';
  home_clock_review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  home_address: string | null;
  clock_in_distance_meters: number | null;
  clock_out_distance_meters: number | null;
}

interface AutoClockOutSettings {
  auto_clock_out_enabled: boolean;
  forgot_clock_out_penalty_points: number;
  auto_clock_out_cutoff_time: string;
  auto_clock_out_time: string;
  auto_clock_out_schedule_enabled: boolean;
  last_auto_clock_out_run: string | null;
  timezone: string;
}

interface HomeClockSettings {
  home_clock_notification_enabled: boolean;
  home_location_radius_meters: number;
  home_clock_notification_roles: string[];
  require_gps_for_clock_in: boolean;
  require_gps_for_clock_out: boolean;
}

interface TimeRequestSettings {
  shop_time_request_enabled: boolean;
  training_time_request_enabled: boolean;
  time_request_requires_approval: boolean;
  time_request_approver_ids: string[];
}

interface ApproverProfile {
  id: string;
  full_name: string | null;
  email: string;
  role: string | null;
}

interface PendingTimeRequest {
  id: string;
  session_type: 'shop_time' | 'training';
  predetermined_hours: number | null;
  request_reason: string | null;
  session_date: string;
  assigned_profile: { full_name: string | null } | null;
}

export function TimeClockManagement() {
  const { user } = useAuth();
  const [autoClockOutSettings, setAutoClockOutSettings] = useState<AutoClockOutSettings>({
    auto_clock_out_enabled: true,
    forgot_clock_out_penalty_points: -15,
    auto_clock_out_cutoff_time: '22:00:00',
    auto_clock_out_time: '16:00:00',
    auto_clock_out_schedule_enabled: false,
    last_auto_clock_out_run: null,
    timezone: 'America/Chicago'
  });
  const [homeClockSettings, setHomeClockSettings] = useState<HomeClockSettings>({
    home_clock_notification_enabled: true,
    home_location_radius_meters: 100,
    home_clock_notification_roles: ['admin', 'office_manager', 'production_manager', 'service_manager'],
    require_gps_for_clock_in: true,
    require_gps_for_clock_out: true
  });
  const [timeRequestSettings, setTimeRequestSettings] = useState<TimeRequestSettings>({
    shop_time_request_enabled: true,
    training_time_request_enabled: true,
    time_request_requires_approval: true,
    time_request_approver_ids: [],
  });
  const [approverProfiles, setApproverProfiles] = useState<ApproverProfile[]>([]);
  const [pendingAutoClockOuts, setPendingAutoClockOuts] = useState<PendingAutoClockOut[]>([]);
  const [homeClockEvents, setHomeClockEvents] = useState<HomeClockEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<HomeClockEvent | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [runningAutoClockOut, setRunningAutoClockOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'reviewed' | 'approved' | 'flagged'>('pending');
  const [recentAutoClockOuts, setRecentAutoClockOuts] = useState<any[]>([]);
  const [showRecentAutoClockOuts, setShowRecentAutoClockOuts] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showCSVTutorial, setShowCSVTutorial] = useState(false);
  const [orgTimezone, setOrgTimezone] = useState('America/Chicago');
  const [confirmClearAlerts, setConfirmClearAlerts] = useState(false);
  const [confirmRunAutoClockOut, setConfirmRunAutoClockOut] = useState(false);

  // Inline pending time requests state
  const [pendingTimeRequests, setPendingTimeRequests] = useState<PendingTimeRequest[]>([]);
  const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null);
  const [denyingRequestId, setDenyingRequestId] = useState<string | null>(null);
  const [showDenyFormFor, setShowDenyFormFor] = useState<string | null>(null);
  const [denyReasonInput, setDenyReasonInput] = useState<Record<string, string>>({});

  const availableRoles = [
    { value: 'admin', label: 'Admin' },
    { value: 'office_manager', label: 'Office Manager' },
    { value: 'production_manager', label: 'Production Manager' },
    { value: 'service_manager', label: 'Service Manager' },
    { value: 'sales', label: 'Sales' },
    { value: 'technician', label: 'Technician' },
  ];

  useEffect(() => {
    getOrganizationTimezone().then(tz => setOrgTimezone(tz));
    loadAutoClockOutSettings();
    loadPendingAutoClockOuts();
    loadHomeClockEvents();
    loadRecentAutoClockOuts();
    loadApproverProfiles();
    loadPendingTimeRequests();

    const channel = supabase
      .channel('time-clock-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_clock_entries'
      }, () => {
        loadPendingAutoClockOuts();
        loadHomeClockEvents();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'internal_time_sessions',
      }, () => {
        loadPendingTimeRequests();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    loadHomeClockEvents();
  }, [filterStatus]);

  async function loadAutoClockOutSettings() {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select(`
          auto_clock_out_enabled,
          forgot_clock_out_penalty_points,
          auto_clock_out_cutoff_time,
          auto_clock_out_time,
          auto_clock_out_schedule_enabled,
          last_auto_clock_out_run,
          timezone,
          home_clock_notification_enabled,
          home_location_radius_meters,
          home_clock_notification_roles,
          require_gps_for_clock_in,
          require_gps_for_clock_out,
          shop_time_request_enabled,
          training_time_request_enabled,
          time_request_requires_approval,
          time_request_approver_ids
        `)
        .single();

      if (error) throw error;
      if (data) {
        setAutoClockOutSettings({
          auto_clock_out_enabled: data.auto_clock_out_enabled ?? true,
          forgot_clock_out_penalty_points: data.forgot_clock_out_penalty_points ?? -15,
          auto_clock_out_cutoff_time: data.auto_clock_out_cutoff_time ?? '22:00:00',
          auto_clock_out_time: data.auto_clock_out_time ?? '16:00:00',
          auto_clock_out_schedule_enabled: data.auto_clock_out_schedule_enabled ?? false,
          last_auto_clock_out_run: data.last_auto_clock_out_run,
          timezone: data.timezone ?? 'America/Chicago'
        });
        setHomeClockSettings({
          home_clock_notification_enabled: data.home_clock_notification_enabled ?? true,
          home_location_radius_meters: data.home_location_radius_meters ?? 100,
          home_clock_notification_roles: data.home_clock_notification_roles ?? ['admin', 'office_manager', 'production_manager', 'service_manager'],
          require_gps_for_clock_in: data.require_gps_for_clock_in ?? true,
          require_gps_for_clock_out: data.require_gps_for_clock_out ?? true
        });
        setTimeRequestSettings({
          shop_time_request_enabled: data.shop_time_request_enabled ?? true,
          training_time_request_enabled: data.training_time_request_enabled ?? true,
          time_request_requires_approval: data.time_request_requires_approval ?? true,
          time_request_approver_ids: data.time_request_approver_ids ?? [],
        });
      }
    } catch (error) {
      console.error('Error loading auto clock-out settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadApproverProfiles() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['admin', 'manager', 'service_manager', 'office_manager', 'production_manager'])
        .order('full_name');
      setApproverProfiles(data ?? []);
    } catch (error) {
      console.error('Error loading approver profiles:', error);
    }
  }

  async function loadPendingTimeRequests() {
    try {
      const { data, error } = await supabase
        .from('internal_time_sessions')
        .select('id, session_type, predetermined_hours, request_reason, session_date, assigned_profile:profiles!assigned_to(full_name)')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPendingTimeRequests((data as any[]) ?? []);
    } catch (error) {
      console.error('Error loading pending time requests:', error);
    }
  }

  async function approveTimeRequest(id: string) {
    setApprovingRequestId(id);
    try {
      const { error } = await supabase
        .from('internal_time_sessions')
        .update({ status: 'scheduled', approved_by: user?.id, approved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      supabase.functions.invoke('send-time-request-notification', {
        body: { sessionId: id, direction: 'to_tech' },
      }).catch(() => {});
      await loadPendingTimeRequests();
    } catch (err: any) {
      alert(err.message || 'Failed to approve');
    } finally {
      setApprovingRequestId(null);
    }
  }

  async function denyTimeRequest(id: string) {
    const reason = denyReasonInput[id]?.trim();
    setDenyingRequestId(id);
    try {
      const { error } = await supabase
        .from('internal_time_sessions')
        .update({ status: 'denied', denial_reason: reason || null })
        .eq('id', id);
      if (error) throw error;
      supabase.functions.invoke('send-time-request-notification', {
        body: { sessionId: id, direction: 'to_tech' },
      }).catch(() => {});
      setShowDenyFormFor(null);
      setDenyReasonInput(prev => { const n = { ...prev }; delete n[id]; return n; });
      await loadPendingTimeRequests();
    } catch (err: any) {
      alert(err.message || 'Failed to deny');
    } finally {
      setDenyingRequestId(null);
    }
  }

  async function loadPendingAutoClockOuts() {
    try {
      const { data, error } = await supabase
        .from('entries_pending_auto_clock_out')
        .select('*');

      if (error) throw error;
      setPendingAutoClockOuts(data || []);
    } catch (error) {
      console.error('Error loading pending auto clock-outs:', error);
    }
  }

  async function loadHomeClockEvents() {
    try {
      let query = supabase
        .from('home_clock_events_pending_review')
        .select('*');

      if (filterStatus !== 'all') {
        query = query.eq('home_clock_review_status', filterStatus);
      }

      const { data, error } = await query.order('entry_date', { ascending: false }).limit(50);

      if (error) throw error;
      setHomeClockEvents(data || []);
    } catch (error) {
      console.error('Error loading home clock events:', error);
    }
  }

  async function loadRecentAutoClockOuts() {
    try {
      const { data, error } = await supabase.rpc('get_recent_auto_clock_outs', { days_ago: 7 });

      if (error) throw error;
      setRecentAutoClockOuts(data || []);
    } catch (error) {
      console.error('Error loading recent auto clock-outs:', error);
    }
  }

  async function updateEventStatus(eventId: string, status: 'reviewed' | 'approved' | 'flagged', notes: string = '') {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('daily_clock_entries')
        .update({
          home_clock_review_status: status,
          home_clock_review_notes: notes || null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', eventId);

      if (error) throw error;

      await loadHomeClockEvents();
      setSelectedEvent(null);
      setReviewNotes('');
    } catch (error) {
      console.error('Error updating event status:', error);
      alert('Failed to update event status');
    }
  }

  async function clearAllPendingAlerts() {
    if (!user?.id) return;

    const pendingCount = homeClockEvents.filter(e => e.home_clock_review_status === 'pending').length;

    if (pendingCount === 0) {
      alert('No pending alerts to clear');
      return;
    }

    try {
      const pendingIds = homeClockEvents
        .filter(e => e.home_clock_review_status === 'pending')
        .map(e => e.id);

      const { error } = await supabase
        .from('daily_clock_entries')
        .update({
          home_clock_review_status: 'reviewed',
          home_clock_review_notes: 'Bulk reviewed',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString()
        })
        .in('id', pendingIds);

      if (error) throw error;

      await loadHomeClockEvents();
      alert(`Successfully marked ${pendingCount} alert(s) as reviewed`);
    } catch (error) {
      console.error('Error clearing all pending alerts:', error);
      alert('Failed to clear all pending alerts');
    }
  }

  async function saveAutoClockOutSettings() {
    setSaving(true);
    try {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('id')
        .maybeSingle();

      if (settings?.id) {
        const { error } = await supabase
          .from('company_settings')
          .update({
            auto_clock_out_enabled: autoClockOutSettings.auto_clock_out_enabled,
            forgot_clock_out_penalty_points: autoClockOutSettings.forgot_clock_out_penalty_points,
            auto_clock_out_cutoff_time: autoClockOutSettings.auto_clock_out_cutoff_time,
            auto_clock_out_time: autoClockOutSettings.auto_clock_out_time,
            auto_clock_out_schedule_enabled: autoClockOutSettings.auto_clock_out_schedule_enabled,
            timezone: autoClockOutSettings.timezone,
            home_clock_notification_enabled: homeClockSettings.home_clock_notification_enabled,
            home_location_radius_meters: homeClockSettings.home_location_radius_meters,
            home_clock_notification_roles: homeClockSettings.home_clock_notification_roles,
            require_gps_for_clock_in: homeClockSettings.require_gps_for_clock_in,
            require_gps_for_clock_out: homeClockSettings.require_gps_for_clock_out,
            shop_time_request_enabled: timeRequestSettings.shop_time_request_enabled,
            training_time_request_enabled: timeRequestSettings.training_time_request_enabled,
            time_request_requires_approval: timeRequestSettings.time_request_requires_approval,
            time_request_approver_ids: timeRequestSettings.time_request_approver_ids,
          })
          .eq('id', settings.id);

        if (error) throw error;
      }
      alert('Time clock settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function toggleRole(role: string) {
    setHomeClockSettings(prev => {
      const roles = prev.home_clock_notification_roles.includes(role)
        ? prev.home_clock_notification_roles.filter(r => r !== role)
        : [...prev.home_clock_notification_roles, role];
      return { ...prev, home_clock_notification_roles: roles };
    });
  }

  function toggleApprover(userId: string) {
    setTimeRequestSettings(prev => {
      const ids = prev.time_request_approver_ids.includes(userId)
        ? prev.time_request_approver_ids.filter(id => id !== userId)
        : [...prev.time_request_approver_ids, userId];
      return { ...prev, time_request_approver_ids: ids };
    });
  }

  function getRoleLabel(role: string | null) {
    const map: Record<string, string> = {
      admin: 'Admin',
      manager: 'Manager',
      service_manager: 'Service Manager',
      office_manager: 'Office Manager',
      production_manager: 'Production Manager',
    };
    return role ? (map[role] ?? role) : '';
  }

  async function runAutoClockOut() {
    setRunningAutoClockOut(true);
    try {
      const { data, error } = await supabase.rpc('auto_clock_out_forgotten_entries');

      if (error) throw error;

      const result = data;
      if (result && result.success) {
        alert(`Successfully processed ${result.entries_processed} clock entries.\n` +
              `Total points deducted: ${result.total_points_deducted || 0}\n` +
              `${result.admin_notified ? `Notified ${result.notification_count} admin(s).` : ''}`);
        loadPendingAutoClockOuts();
        loadRecentAutoClockOuts();
        loadAutoClockOutSettings();
      } else {
        alert(result.message || 'Failed to run auto clock-out');
      }
    } catch (error) {
      console.error('Error running auto clock-out:', error);
      alert('Failed to run auto clock-out');
    } finally {
      setRunningAutoClockOut(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Time Clock Settings
          </h3>
          <p className="text-sm text-gray-600">
            Configure automatic clock-out system for employees who forget to clock out
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCSVTutorial(true)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="CSV Import Tutorial"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowCSVImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
        </div>
      </div>

      {/* Auto Clock-Out Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Power className="w-5 h-5 text-blue-600" />
            <h4 className="font-medium text-gray-900">Automatic Clock-Out System</h4>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoClockOutSettings.auto_clock_out_enabled}
                onChange={(e) => setAutoClockOutSettings({
                  ...autoClockOutSettings,
                  auto_clock_out_enabled: e.target.checked
                })}
                className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">Enable Auto Clock-Out</span>
                <p className="text-xs text-gray-500">Automatically clock out users who forgot</p>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Timezone
              </label>
              <select
                value={autoClockOutSettings.timezone}
                onChange={(e) => setAutoClockOutSettings({
                  ...autoClockOutSettings,
                  timezone: e.target.value
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Phoenix">Arizona Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="America/Anchorage">Alaska Time</option>
                <option value="Pacific/Honolulu">Hawaii Time</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Used for auto clock-out time calculations
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                If User Does Not Clock Out By
              </label>
              <input
                type="time"
                value={autoClockOutSettings.auto_clock_out_cutoff_time}
                onChange={(e) => setAutoClockOutSettings({
                  ...autoClockOutSettings,
                  auto_clock_out_cutoff_time: e.target.value
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Check for forgotten clock-outs after this time (e.g., 10:00 PM)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Auto Clock-Out Time
              </label>
              <input
                type="time"
                value={autoClockOutSettings.auto_clock_out_time}
                onChange={(e) => setAutoClockOutSettings({
                  ...autoClockOutSettings,
                  auto_clock_out_time: e.target.value
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Clock users out at this time if they forgot (e.g., 4:00 PM)
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Penalty Points
            </label>
            <input
              type="number"
              value={autoClockOutSettings.forgot_clock_out_penalty_points}
              onChange={(e) => setAutoClockOutSettings({
                ...autoClockOutSettings,
                forgot_clock_out_penalty_points: parseInt(e.target.value)
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent max-w-xs"
            />
            <p className="text-xs text-gray-500 mt-1">Points deducted when user forgets to clock out (use negative numbers)</p>
          </div>

          {/* Automatic Scheduler */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h5 className="text-sm font-medium text-gray-900 mb-1">Automatic Scheduled Execution</h5>
                <p className="text-xs text-gray-600">Run auto clock-out automatically each day at the cutoff time</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoClockOutSettings.auto_clock_out_schedule_enabled}
                  onChange={(e) => setAutoClockOutSettings({
                    ...autoClockOutSettings,
                    auto_clock_out_schedule_enabled: e.target.checked
                  })}
                  className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-900">
                  {autoClockOutSettings.auto_clock_out_schedule_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>
            {autoClockOutSettings.last_auto_clock_out_run && (
              <div className="text-xs text-gray-600 flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-600" />
                Last run: {formatTimeInTimezone(autoClockOutSettings.last_auto_clock_out_run, orgTimezone, 'MMM d, h:mm aa')}
              </div>
            )}
            {autoClockOutSettings.auto_clock_out_schedule_enabled && (
              <div className="mt-2 text-xs text-blue-700">
                <Clock className="w-3 h-3 inline mr-1" />
                Next scheduled run: Today at {autoClockOutSettings.auto_clock_out_cutoff_time}
              </div>
            )}
          </div>

          {/* Example explanation */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-medium text-gray-900 mb-2">How It Works:</h5>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <strong>Example:</strong> Set cutoff time to <strong>10:00 PM</strong> and auto clock-out time to <strong>4:00 PM</strong>
              </p>
              <p className="mt-2">• At 10:00 PM, the system checks for users still clocked in from earlier that day</p>
              <p>• If user forgot to clock out, they are automatically clocked out at 4:00 PM (your typical end time)</p>
              <p>• Admin receives notification and can review/approve these entries before payroll</p>
              <p>• Penalty points are deducted automatically (as configured above)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Auto Clock-Outs */}
      {pendingAutoClockOuts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <h4 className="font-medium text-yellow-900">
                {pendingAutoClockOuts.length} User(s) Forgot to Clock Out
              </h4>
            </div>
            <button
              onClick={() => setConfirmRunAutoClockOut(true)}
              disabled={runningAutoClockOut}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {runningAutoClockOut ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Power className="w-4 h-4" />
                  Run Auto Clock-Out Now
                </>
              )}
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {pendingAutoClockOuts.map(entry => (
              <div key={entry.id} className="flex items-center justify-between bg-white border border-yellow-200 p-3 rounded">
                <div>
                  <div className="text-sm font-medium text-gray-900">{entry.full_name}</div>
                  <div className="text-xs text-gray-600">
                    Clocked in: {formatTimeInTimezone(entry.clock_in, orgTimezone, 'MMM d, h:mm aa')} ({Math.floor(entry.hours_since_clock_in)}h ago)
                  </div>
                </div>
                <div className="text-xs text-yellow-700 font-medium">
                  Will clock out at: {entry.will_clock_out_at}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Auto Clock-Outs */}
      {recentAutoClockOuts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
          <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <h4 className="font-medium text-gray-900">Recent Auto Clock-Outs</h4>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                Last 7 Days
              </span>
            </div>
            <button
              onClick={() => setShowRecentAutoClockOuts(!showRecentAutoClockOuts)}
              className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1"
            >
              <Eye className="w-4 h-4" />
              {showRecentAutoClockOuts ? 'Hide' : 'Show'} History
            </button>
          </div>

          {showRecentAutoClockOuts && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {recentAutoClockOuts.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-50 border border-gray-200 p-3 rounded">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">{entry.technician_name}</span>
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                        -{Math.abs(entry.points_deducted || 0)} points
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <div>
                        Clock In: {formatTimeInTimezone(entry.clock_in_at, orgTimezone, 'MMM d, h:mm aa')}
                        {entry.clock_in_address && (
                          <span className="ml-2 text-gray-500">
                            <MapPin className="w-3 h-3 inline" /> {entry.clock_in_address}
                          </span>
                        )}
                      </div>
                      <div>
                        Auto Clocked Out: {formatTimeInTimezone(entry.auto_clocked_out_at, orgTimezone, 'MMM d, h:mm aa')}
                        {entry.clock_out_address && (
                          <span className="ml-2 text-gray-500">
                            <MapPin className="w-3 h-3 inline" /> {entry.clock_out_address}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!showRecentAutoClockOuts && (
            <div className="text-sm text-gray-600 text-center py-3">
              {recentAutoClockOuts.length} auto clock-out{recentAutoClockOuts.length !== 1 ? 's' : ''} in the last 7 days
            </div>
          )}
        </div>
      )}

      {/* Home Clock Events - Review Queue */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-gray-200 mb-4 gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-orange-600" />
            <h4 className="font-medium text-gray-900">Home Clock Event Alerts</h4>
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
              {homeClockEvents.filter(e => e.home_clock_review_status === 'pending').length} Pending
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="flex gap-2 flex-wrap">
              {(['all', 'pending', 'reviewed', 'approved', 'flagged'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    filterStatus === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
            {homeClockEvents.filter(e => e.home_clock_review_status === 'pending').length > 0 && (
              <button
                onClick={() => setConfirmClearAlerts(true)}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap"
                title="Mark all pending alerts as reviewed"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {homeClockEvents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <MapPin className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No home clock events to review</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {homeClockEvents.map(event => (
              <div
                key={event.id}
                className={`border rounded-lg p-4 ${
                  event.home_clock_review_status === 'pending'
                    ? 'bg-orange-50 border-orange-200'
                    : event.home_clock_review_status === 'flagged'
                    ? 'bg-red-50 border-red-200'
                    : event.home_clock_review_status === 'approved'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h5 className="font-medium text-gray-900">{event.technician_name}</h5>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        event.home_clock_review_status === 'pending'
                          ? 'bg-orange-100 text-orange-700'
                          : event.home_clock_review_status === 'flagged'
                          ? 'bg-red-100 text-red-700'
                          : event.home_clock_review_status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {event.home_clock_review_status}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span className="font-medium">Date:</span>
                        {formatTimeInTimezone(event.entry_date + 'T12:00:00', orgTimezone, 'MMM d, yyyy')}
                      </div>

                      {event.clocked_in_from_home && event.clock_in && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-orange-500" />
                          <span className="font-medium">Clock In:</span>
                          {formatTimeInTimezone(event.clock_in, orgTimezone, 'h:mm aa')}
                          {event.clock_in_distance_meters !== null && (
                            <span className="text-xs text-orange-600">
                              ({event.clock_in_distance_meters}m from home)
                            </span>
                          )}
                        </div>
                      )}

                      {event.clocked_out_from_home && event.clock_out && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-orange-500" />
                          <span className="font-medium">Clock Out:</span>
                          {formatTimeInTimezone(event.clock_out, orgTimezone, 'h:mm aa')}
                          {event.clock_out_distance_meters !== null && (
                            <span className="text-xs text-orange-600">
                              ({event.clock_out_distance_meters}m from home)
                            </span>
                          )}
                        </div>
                      )}

                      {event.home_address && (
                        <div className="text-xs text-gray-500">
                          Home: {event.home_address}
                        </div>
                      )}

                      {event.reviewed_at && event.reviewed_by_name && (
                        <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                          Reviewed by {event.reviewed_by_name} on {formatTimeInTimezone(event.reviewed_at, orgTimezone, 'MMM d, h:mm aa')}
                        </div>
                      )}

                      {event.home_clock_review_notes && (
                        <div className="text-xs bg-white border border-gray-200 rounded p-2 mt-2">
                          <span className="font-medium">Notes:</span> {event.home_clock_review_notes}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-1 ml-4">
                    <button
                      onClick={() => {
                        setSelectedEvent(event);
                        setReviewNotes(event.home_clock_review_notes || '');
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                      title="Review/Edit"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => updateEventStatus(event.id, 'approved', event.home_clock_review_notes || '')}
                      className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                      title="Approve"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => updateEventStatus(event.id, 'flagged', event.home_clock_review_notes || 'Flagged for review')}
                      className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                      title="Flag"
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Review Home Clock Event</h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Technician</label>
                <p className="text-gray-900">{selectedEvent.technician_name}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <p className="text-gray-900">{formatTimeInTimezone(selectedEvent.entry_date + 'T12:00:00', orgTimezone, 'MMM d, yyyy')}</p>
              </div>

              {selectedEvent.clocked_in_from_home && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Clock In From Home</label>
                  <p className="text-gray-900">
                    {selectedEvent.clock_in && formatTimeInTimezone(selectedEvent.clock_in, orgTimezone, 'h:mm aa')}
                    {selectedEvent.clock_in_distance_meters !== null && (
                      <span className="text-sm text-orange-600 ml-2">
                        ({selectedEvent.clock_in_distance_meters}m from home)
                      </span>
                    )}
                  </p>
                  {selectedEvent.clock_in_address && (
                    <p className="text-sm text-gray-500 mt-1">{selectedEvent.clock_in_address}</p>
                  )}
                </div>
              )}

              {selectedEvent.clocked_out_from_home && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Clock Out From Home</label>
                  <p className="text-gray-900">
                    {selectedEvent.clock_out && formatTimeInTimezone(selectedEvent.clock_out, orgTimezone, 'h:mm aa')}
                    {selectedEvent.clock_out_distance_meters !== null && (
                      <span className="text-sm text-orange-600 ml-2">
                        ({selectedEvent.clock_out_distance_meters}m from home)
                      </span>
                    )}
                  </p>
                  {selectedEvent.clock_out_address && (
                    <p className="text-sm text-gray-500 mt-1">{selectedEvent.clock_out_address}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Review Notes</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add notes about this event..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex flex-wrap justify-end gap-3">
              <button
                onClick={() => {
                  setSelectedEvent(null);
                  setReviewNotes('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => updateEventStatus(selectedEvent.id, 'flagged', reviewNotes)}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                <Flag className="w-4 h-4" />
                Flag for Review
              </button>
              <button
                onClick={() => updateEventStatus(selectedEvent.id, 'reviewed', reviewNotes)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                <Eye className="w-4 h-4" />
                Mark as Reviewed
              </button>
              <button
                onClick={() => updateEventStatus(selectedEvent.id, 'approved', reviewNotes)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Home Clock Notification Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <h4 className="font-medium text-gray-900">GPS & Home Clock Notifications</h4>
          </div>
        </div>

        <div className="space-y-6">
          {/* GPS Requirements */}
          <div className="space-y-3">
            <h5 className="text-sm font-medium text-gray-900">GPS Requirements</h5>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={homeClockSettings.require_gps_for_clock_in}
                  onChange={(e) => setHomeClockSettings({
                    ...homeClockSettings,
                    require_gps_for_clock_in: e.target.checked
                  })}
                  className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Require GPS for Clock In</span>
                  <p className="text-xs text-gray-500">Capture location data when clocking in</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={homeClockSettings.require_gps_for_clock_out}
                  onChange={(e) => setHomeClockSettings({
                    ...homeClockSettings,
                    require_gps_for_clock_out: e.target.checked
                  })}
                  className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Require GPS for Clock Out</span>
                  <p className="text-xs text-gray-500">Capture location data when clocking out</p>
                </div>
              </label>
            </div>
          </div>

          {/* Home Clock Notifications */}
          <div className="pt-4 border-t border-gray-200 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={homeClockSettings.home_clock_notification_enabled}
                onChange={(e) => setHomeClockSettings({
                  ...homeClockSettings,
                  home_clock_notification_enabled: e.target.checked
                })}
                className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">Enable Home Clock Notifications</span>
                <p className="text-xs text-gray-500">Alert when technicians clock in/out from home address</p>
              </div>
            </label>

            {homeClockSettings.home_clock_notification_enabled && (
              <div className="ml-7 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Home Location Radius (meters)
                  </label>
                  <input
                    type="number"
                    value={homeClockSettings.home_location_radius_meters}
                    onChange={(e) => setHomeClockSettings({
                      ...homeClockSettings,
                      home_location_radius_meters: parseInt(e.target.value)
                    })}
                    min="10"
                    max="1000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent max-w-xs"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Distance from home address to trigger notification (default: 100m)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notify These Roles
                  </label>
                  <div className="space-y-2">
                    {availableRoles.map(role => (
                      <label key={role.value} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={homeClockSettings.home_clock_notification_roles.includes(role.value)}
                          onChange={() => toggleRole(role.value)}
                          className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-900">{role.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Selected roles will receive notifications when someone clocks in/out from home
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Example explanation */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-medium text-gray-900 mb-2">How It Works:</h5>
            <div className="text-sm text-gray-600 space-y-1">
              <p>• Technicians set their home address with GPS coordinates in their profile</p>
              <p>• When they clock in/out within the specified radius of home, the system detects it</p>
              <p>• Selected roles receive a notification showing who clocked in/out from home and when</p>
              <p>• This helps monitor attendance policy compliance and track remote work</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-900 mb-1">Time Clock Reports & History</h4>
            <p className="text-sm text-blue-800">
              To view time clock entries, history, and status for all technicians, go to <strong>Dispatch → Daily Clock</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Inline Pending Time Requests Panel */}
      {pendingTimeRequests.length > 0 && (
        <div className="bg-white border-2 border-orange-300 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-orange-50 border-b border-orange-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <h4 className="font-semibold text-orange-900">
                {pendingTimeRequests.length} Time Request{pendingTimeRequests.length > 1 ? 's' : ''} Awaiting Approval
              </h4>
            </div>
            <span className="text-xs text-orange-700 font-medium">
              Approve or deny below, or go to Dispatch &rarr; Shop &amp; Training
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingTimeRequests.map(req => (
              <div key={req.id} className="px-4 sm:px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      req.session_type === 'shop_time' ? 'bg-amber-100' : 'bg-teal-100'
                    }`}>
                      {req.session_type === 'shop_time'
                        ? <Wrench className="w-4 h-4 text-amber-600" />
                        : <BookOpen className="w-4 h-4 text-teal-600" />
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {(req.assigned_profile as any)?.full_name ?? 'Unknown'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          req.session_type === 'shop_time'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-teal-100 text-teal-700'
                        }`}>
                          {req.session_type === 'shop_time' ? 'Shop Time' : 'Training'}
                        </span>
                        {req.predetermined_hours && (
                          <span className="text-xs text-blue-700 font-medium">{req.predetermined_hours}h</span>
                        )}
                        <span className="text-xs text-gray-500">
                          {(() => {
                            const [y, mo, d] = req.session_date.split('-').map(Number);
                            return new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                          })()}
                        </span>
                      </div>
                      {req.request_reason && (
                        <p className="text-xs text-gray-500 mt-0.5 italic">"{req.request_reason}"</p>
                      )}
                      {showDenyFormFor === req.id && (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={denyReasonInput[req.id] || ''}
                            onChange={e => setDenyReasonInput(prev => ({ ...prev, [req.id]: e.target.value }))}
                            placeholder="Reason for denial (optional)"
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-red-400 focus:border-transparent"
                          />
                          <button
                            onClick={() => denyTimeRequest(req.id)}
                            disabled={denyingRequestId === req.id}
                            className="flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {denyingRequestId === req.id ? '...' : 'Confirm Deny'}
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
                  {showDenyFormFor !== req.id && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => approveTimeRequest(req.id)}
                        disabled={approvingRequestId === req.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        {approvingRequestId === req.id ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => setShowDenyFormFor(req.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
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

      {/* Shop & Training Time Requests */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-2 pb-4 border-b border-gray-200">
          <Wrench className="w-5 h-5 text-amber-600" />
          <h4 className="font-medium text-gray-900">Shop & Training Time Requests</h4>
        </div>

        <p className="text-sm text-gray-600 -mt-2">
          Allow technicians and hourly employees to self-request shop time or training sessions directly from their dashboard.
        </p>

        <div className="space-y-4">
          {/* Shop Time Toggle */}
          <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Wrench className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-gray-900">Allow Shop Time Requests</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Techs can request paid time for cleaning, organizing, bench work, and shop chores
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTimeRequestSettings(prev => ({ ...prev, shop_time_request_enabled: !prev.shop_time_request_enabled }))}
              className="flex-shrink-0 ml-4"
            >
              {timeRequestSettings.shop_time_request_enabled
                ? <ToggleRight className="w-8 h-8 text-amber-600" />
                : <ToggleLeft className="w-8 h-8 text-gray-400" />
              }
            </button>
          </div>

          {/* Training Toggle */}
          <div className="flex items-center justify-between p-4 bg-teal-50 border border-teal-200 rounded-lg">
            <div className="flex items-start gap-3">
              <BookOpen className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-gray-900">Allow Training Requests</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Techs can request paid time for instruction, certifications, and product knowledge
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTimeRequestSettings(prev => ({ ...prev, training_time_request_enabled: !prev.training_time_request_enabled }))}
              className="flex-shrink-0 ml-4"
            >
              {timeRequestSettings.training_time_request_enabled
                ? <ToggleRight className="w-8 h-8 text-teal-600" />
                : <ToggleLeft className="w-8 h-8 text-gray-400" />
              }
            </button>
          </div>

          {/* Approval Required Toggle */}
          {(timeRequestSettings.shop_time_request_enabled || timeRequestSettings.training_time_request_enabled) && (
            <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-gray-900">Require Manager Approval</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {timeRequestSettings.time_request_requires_approval
                      ? 'Requests go to a manager for approval before being added to payroll'
                      : 'Requests are auto-approved and immediately submitted to payroll'
                    }
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTimeRequestSettings(prev => ({ ...prev, time_request_requires_approval: !prev.time_request_requires_approval }))}
                className="flex-shrink-0 ml-4"
              >
                {timeRequestSettings.time_request_requires_approval
                  ? <ToggleRight className="w-8 h-8 text-blue-600" />
                  : <ToggleLeft className="w-8 h-8 text-gray-400" />
                }
              </button>
            </div>
          )}
        </div>

          {/* Approver Picker */}
          {timeRequestSettings.time_request_requires_approval &&
           (timeRequestSettings.shop_time_request_enabled || timeRequestSettings.training_time_request_enabled) && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <Bell className="w-4 h-4 text-gray-600" />
                <h5 className="text-sm font-medium text-gray-900">Who Gets Notified &amp; Can Approve</h5>
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-500 mb-3">
                  Selected team members receive a bell notification and email each time a request is submitted. They can approve or deny from the Dispatch &rarr; Internal Sessions page.
                </p>
                {approverProfiles.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No eligible managers found. Managers, admins, service managers, and office managers appear here.</p>
                ) : (
                  <div className="space-y-2">
                    {approverProfiles.map(profile => {
                      const selected = timeRequestSettings.time_request_approver_ids.includes(profile.id);
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => toggleApprover(profile.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors text-left ${
                            selected
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              selected ? 'bg-blue-100' : 'bg-gray-100'
                            }`}>
                              <User className={`w-4 h-4 ${selected ? 'text-blue-600' : 'text-gray-400'}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {profile.full_name || profile.email}
                              </div>
                              <div className="text-xs text-gray-500 flex items-center gap-1.5">
                                <span>{getRoleLabel(profile.role)}</span>
                                {profile.full_name && (
                                  <>
                                    <span className="text-gray-300">·</span>
                                    <span className="truncate">{profile.email}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className={`flex-shrink-0 ml-3 flex items-center gap-1.5 text-xs font-medium ${
                            selected ? 'text-blue-600' : 'text-gray-400'
                          }`}>
                            {selected ? (
                              <>
                                <Bell className="w-3.5 h-3.5" />
                                <span>Notified</span>
                              </>
                            ) : (
                              <span>Off</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

        {/* Navigation callout — only shown when approval is required */}
        {timeRequestSettings.time_request_requires_approval &&
         (timeRequestSettings.shop_time_request_enabled || timeRequestSettings.training_time_request_enabled) && (
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <ExternalLink className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-blue-900">Approvers manage requests at Dispatch &rarr; Shop &amp; Training</p>
              <p className="text-xs text-blue-700 mt-0.5">
                The full request queue — with approve, deny, and history — lives under the Dispatch department.
                Approvers selected above will also see a badge on their notification bell the moment a request comes in.
              </p>
            </div>
          </div>
        )}

        {/* How it works note */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h5 className="text-sm font-medium text-gray-900 mb-3">How It Works</h5>
          <ol className="space-y-2.5">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Tech submits a request</p>
                <p className="text-xs text-gray-500">Enabled types appear in the <strong>Assigned Sessions</strong> widget on the tech&apos;s dashboard. They enter the type, duration, and reason.</p>
              </div>
            </li>
            {timeRequestSettings.time_request_requires_approval ? (
              <>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Approvers are notified</p>
                    <p className="text-xs text-gray-500">Each selected approver receives a bell notification and an email with the request details.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Manager approves or denies</p>
                    <p className="text-xs text-gray-500">From <strong>Dispatch &rarr; Shop &amp; Training</strong> (or the pending panel above), the manager reviews and acts on the request. A denial reason can be added.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">4</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Time is logged to payroll</p>
                    <p className="text-xs text-gray-500">Approved sessions are scheduled on the tech&apos;s dashboard. When the tech clocks in and out of the session, hours are automatically submitted to payroll.</p>
                  </div>
                </li>
              </>
            ) : (
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">Auto-approved &amp; logged</p>
                  <p className="text-xs text-gray-500">No manager approval needed. The session is immediately scheduled and hours are submitted to payroll once the tech clocks in and out.</p>
                </div>
              </li>
            )}
          </ol>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveAutoClockOutSettings}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>

      {/* CSV Import Tutorial Modal */}
      {showCSVTutorial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto">
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
            loadPendingAutoClockOuts();
            loadHomeClockEvents();
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmClearAlerts}
        title="Clear All Pending Alerts"
        message={`Mark all ${homeClockEvents.filter(e => e.home_clock_review_status === 'pending').length} pending home clock alert(s) as reviewed?`}
        variant="warning"
        confirmLabel="Clear All"
        onConfirm={() => {
          setConfirmClearAlerts(false);
          clearAllPendingAlerts();
        }}
        onCancel={() => setConfirmClearAlerts(false)}
      />

      <ConfirmModal
        isOpen={confirmRunAutoClockOut}
        title="Run Auto Clock-Out"
        message={`This will automatically clock out ${pendingAutoClockOuts.length} user(s) who forgot to clock out. Continue?`}
        variant="warning"
        confirmLabel="Continue"
        onConfirm={() => {
          setConfirmRunAutoClockOut(false);
          runAutoClockOut();
        }}
        onCancel={() => setConfirmRunAutoClockOut(false)}
      />
    </div>
  );
}
