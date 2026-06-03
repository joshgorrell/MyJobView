import { useState, useEffect } from 'react';
import { Calendar, Plus, Edit2, Pause, Play, Trash2, Search, Filter, Clock, RefreshCw, User, AlertCircle, TrendingUp, CheckCircle2, AlertTriangle, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ScheduledConnectionForm } from './ScheduledConnectionForm';
import ConfirmModal from '../ui/ConfirmModal';

interface ScheduledConnection {
  id: string;
  prospect_id: string;
  connection_type: string;
  recurrence_pattern: string;
  recurrence_interval: number;
  recurrence_day_rule: string | null;
  schedule_start_date: string;
  schedule_end_date: string | null;
  is_time_specific: boolean;
  preferred_time: string | null;
  default_notes: string | null;
  is_active: boolean;
  next_occurrence_date: string | null;
  last_occurrence_date: string | null;
  prospect: {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    company_name: string;
  };
  stats?: {
    total_occurrences: number;
    completed: number;
    pending: number;
    completion_rate: number;
  };
}

export function ScheduledConnectionsView() {
  const { profile } = useAuth();
  const [schedules, setSchedules] = useState<ScheduledConnection[]>([]);
  const [filteredSchedules, setFilteredSchedules] = useState<ScheduledConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledConnection | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPattern, setFilterPattern] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadSchedules();
    loadOverdueCount();
  }, [profile]);

  useEffect(() => {
    applyFilters();
  }, [schedules, searchQuery, filterPattern, filterStatus]);

  async function loadOverdueCount() {
    if (!profile) return;

    try {
      const { count, error } = await supabase
        .from('scheduled_connection_occurrences')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('rollover_count', 2);

      if (error) throw error;
      setOverdueCount(count || 0);
    } catch (error) {
      console.error('Error loading overdue count:', error);
    }
  }

  async function loadSchedules() {
    if (!profile) return;

    try {
      setLoading(true);

      const { data: schedulesData, error: schedulesError } = await supabase
        .from('scheduled_connections')
        .select(`
          *,
          prospect:contacts!scheduled_connections_prospect_id_fkey (
            id,
            first_name,
            last_name,
            full_name,
            company_name
          )
        `)
        .eq('created_by_user_id', profile.id)
        .order('next_occurrence_date', { ascending: true, nullsFirst: false });

      if (schedulesError) throw schedulesError;

      // Load stats for each schedule
      const schedulesWithStats = await Promise.all(
        (schedulesData || []).map(async (schedule) => {
          const { data: occurrences } = await supabase
            .from('scheduled_connection_occurrences')
            .select('is_completed, is_skipped')
            .eq('scheduled_connection_id', schedule.id);

          const total = occurrences?.length || 0;
          const completed = occurrences?.filter(o => o.is_completed).length || 0;
          const pending = occurrences?.filter(o => !o.is_completed && !o.is_skipped).length || 0;

          return {
            ...schedule,
            stats: {
              total_occurrences: total,
              completed,
              pending,
              completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0
            }
          };
        })
      );

      setSchedules(schedulesWithStats);
    } catch (error) {
      console.error('Error loading scheduled connections:', error);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    let filtered = [...schedules];

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s =>
        s.prospect.full_name?.toLowerCase().includes(query) ||
        s.prospect.company_name?.toLowerCase().includes(query) ||
        s.connection_type.toLowerCase().includes(query)
      );
    }

    // Apply pattern filter
    if (filterPattern !== 'all') {
      filtered = filtered.filter(s => s.recurrence_pattern === filterPattern);
    }

    // Apply status filter
    if (filterStatus === 'active') {
      filtered = filtered.filter(s => s.is_active);
    } else if (filterStatus === 'paused') {
      filtered = filtered.filter(s => !s.is_active);
    }

    setFilteredSchedules(filtered);
  }

  async function handleToggleActive(schedule: ScheduledConnection) {
    try {
      const { error } = await supabase
        .from('scheduled_connections')
        .update({ is_active: !schedule.is_active })
        .eq('id', schedule.id);

      if (error) throw error;

      await loadSchedules();
    } catch (error) {
      console.error('Error toggling schedule:', error);
      alert('Failed to update schedule status');
    }
  }

  async function handleDelete(schedule: ScheduledConnection) {
    const scheduleToDelete = schedule;
    setConfirmModal({
      title: 'Delete Schedule',
      message: `Delete scheduled connections with ${scheduleToDelete.prospect.full_name}? This will remove all future occurrences.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await doDeleteSchedule(scheduleToDelete);
      }
    });
  }

  async function doDeleteSchedule(schedule: ScheduledConnection) {
    try {
      const { error } = await supabase
        .from('scheduled_connections')
        .delete()
        .eq('id', schedule.id);

      if (error) throw error;

      await loadSchedules();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      alert('Failed to delete schedule');
    }
  }

  function formatPattern(schedule: ScheduledConnection): string {
    let pattern = schedule.recurrence_pattern.replace(/_/g, ' ');

    if (schedule.recurrence_pattern === 'custom') {
      pattern = `Every ${schedule.recurrence_interval} month${schedule.recurrence_interval > 1 ? 's' : ''}`;
    } else if (schedule.recurrence_pattern === 'monthly' && schedule.recurrence_interval > 1) {
      pattern = `Every ${schedule.recurrence_interval} months`;
    }

    if (schedule.recurrence_day_rule) {
      if (schedule.recurrence_day_rule.match(/^\d+$/)) {
        pattern += ` (${schedule.recurrence_day_rule}${getOrdinalSuffix(parseInt(schedule.recurrence_day_rule))} of month)`;
      } else {
        pattern += ` (${schedule.recurrence_day_rule.replace(/_/g, ' ')})`;
      }
    }

    return pattern.charAt(0).toUpperCase() + pattern.slice(1);
  }

  function getOrdinalSuffix(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  function formatConnectionType(type: string): string {
    return type.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-300">Loading scheduled connections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Scheduled Connections</h2>
          <p className="text-sm sm:text-base text-gray-400 mt-1">Manage recurring touchpoints with your prospects</p>
        </div>
        <button
          onClick={() => {
            setEditingSchedule(null);
            setShowForm(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium touch-manipulation min-h-[44px] whitespace-nowrap"
        >
          <Plus className="w-5 h-5" />
          <span>New Schedule</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 sm:p-5 text-white">
          <div className="flex items-center justify-between mb-2">
            <Calendar className="w-6 sm:w-8 h-6 sm:h-8 opacity-80" />
            <span className="text-2xl sm:text-3xl font-bold">{schedules.filter(s => s.is_active).length}</span>
          </div>
          <div className="text-xs sm:text-sm opacity-90">Active Schedules</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 sm:p-5 text-white">
          <div className="flex items-center justify-between mb-2">
            <User className="w-6 sm:w-8 h-6 sm:h-8 opacity-80" />
            <span className="text-2xl sm:text-3xl font-bold">{new Set(schedules.map(s => s.prospect_id)).size}</span>
          </div>
          <div className="text-xs sm:text-sm opacity-90">Prospects</div>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg p-4 sm:p-5 text-white">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-6 sm:w-8 h-6 sm:h-8 opacity-80" />
            <span className="text-2xl sm:text-3xl font-bold">
              {schedules.reduce((sum, s) => sum + (s.stats?.pending || 0), 0)}
            </span>
          </div>
          <div className="text-xs sm:text-sm opacity-90">Pending Today</div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 sm:p-5 text-white">
          <div className="flex items-center justify-between mb-2">
            <RefreshCw className="w-6 sm:w-8 h-6 sm:h-8 opacity-80" />
            <span className="text-2xl sm:text-3xl font-bold">
              {schedules.length > 0
                ? Math.round(schedules.reduce((sum, s) => sum + (s.stats?.completion_rate || 0), 0) / schedules.length)
                : 0}%
            </span>
          </div>
          <div className="text-xs sm:text-sm opacity-90">Avg Completion</div>
        </div>
      </div>

      {/* Analytics Insights */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowAnalytics(!showAnalytics)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Connection Analytics</h3>
          </div>
          <div className="flex items-center gap-4">
            {overdueCount > 0 && (
              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                {overdueCount} overdue
              </span>
            )}
            <AlertCircle className={`w-5 h-5 text-gray-400 transform transition-transform ${showAnalytics ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {showAnalytics && (
          <div className="border-t border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Completion Trends */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-gray-900">Completion Performance</h4>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Total Completed</span>
                      <span className="font-medium text-gray-900">
                        {schedules.reduce((sum, s) => sum + (s.stats?.completed || 0), 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Total Scheduled</span>
                      <span className="font-medium text-gray-900">
                        {schedules.reduce((sum, s) => sum + (s.stats?.total_occurrences || 0), 0)}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                        style={{
                          width: `${
                            schedules.reduce((sum, s) => sum + (s.stats?.total_occurrences || 0), 0) > 0
                              ? Math.round(
                                  (schedules.reduce((sum, s) => sum + (s.stats?.completed || 0), 0) /
                                    schedules.reduce((sum, s) => sum + (s.stats?.total_occurrences || 0), 0)) *
                                    100
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Connection Types */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-gray-900">Connection Types</h4>
                </div>
                <div className="space-y-2">
                  {Array.from(new Set(schedules.map(s => s.connection_type)))
                    .slice(0, 3)
                    .map((type) => {
                      const count = schedules.filter(s => s.connection_type === type).length;
                      return (
                        <div key={type} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700 truncate">{type}</span>
                          <span className="font-medium text-blue-600">{count}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Overdue Alerts */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-200">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <h4 className="font-semibold text-gray-900">Attention Required</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-700">Overdue (2+ days)</span>
                    <span className={`font-medium ${overdueCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {overdueCount}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-700">Pending Today</span>
                    <span className="font-medium text-amber-600">
                      {schedules.reduce((sum, s) => sum + (s.stats?.pending || 0), 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-700">Inactive Schedules</span>
                    <span className="font-medium text-gray-600">
                      {schedules.filter(s => !s.is_active).length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Performers */}
            {schedules.filter(s => (s.stats?.completion_rate || 0) >= 80 && (s.stats?.total_occurrences || 0) >= 3).length > 0 && (
              <div className="mt-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  Top Performing Connections
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {schedules
                    .filter(s => (s.stats?.completion_rate || 0) >= 80 && (s.stats?.total_occurrences || 0) >= 3)
                    .slice(0, 3)
                    .map((schedule) => (
                      <div key={schedule.id} className="bg-white rounded-md p-3 border border-green-200">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate text-sm">
                              {schedule.prospect?.full_name || schedule.prospect?.company_name}
                            </p>
                            <p className="text-xs text-gray-600">{schedule.connection_type}</p>
                          </div>
                          <span className="text-xs font-semibold text-green-600">
                            {schedule.stats?.completion_rate}%
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {schedule.stats?.completed} of {schedule.stats?.total_occurrences} completed
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search prospects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <select
            value={filterPattern}
            onChange={(e) => setFilterPattern(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Patterns</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="custom">Custom</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </div>
      </div>

      {/* Schedules List */}
      {filteredSchedules.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {schedules.length === 0 ? 'No Scheduled Connections' : 'No Matching Schedules'}
          </h3>
          <p className="text-gray-500 mb-6">
            {schedules.length === 0
              ? 'Create your first scheduled connection to maintain consistent touchpoints with prospects'
              : 'Try adjusting your filters to see more schedules'}
          </p>
          {schedules.length === 0 && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create Schedule
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredSchedules.map((schedule) => (
            <div
              key={schedule.id}
              className={`bg-white rounded-lg shadow-sm border-2 ${
                schedule.is_active ? 'border-green-200' : 'border-gray-200'
              } overflow-hidden transition-all hover:shadow-md`}
            >
              {/* Header */}
              <div className={`px-4 py-3 ${
                schedule.is_active ? 'bg-gradient-to-r from-green-50 to-green-100' : 'bg-gray-50'
              } border-b border-gray-200`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {schedule.prospect.full_name || schedule.prospect.company_name}
                    </h3>
                    {schedule.prospect.company_name && schedule.prospect.full_name && (
                      <p className="text-sm text-gray-600">{schedule.prospect.company_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleActive(schedule)}
                      className={`p-2 rounded-lg transition-colors touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center ${
                        schedule.is_active
                          ? 'text-green-600 hover:bg-green-100'
                          : 'text-gray-400 hover:bg-gray-200'
                      }`}
                      title={schedule.is_active ? 'Pause schedule' : 'Resume schedule'}
                    >
                      {schedule.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setEditingSchedule(schedule);
                        setShowForm(true);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Edit schedule"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(schedule)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Delete schedule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-4 space-y-3">
                {/* Connection Type & Pattern */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Type</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatConnectionType(schedule.connection_type)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Pattern</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatPattern(schedule)}
                    </div>
                  </div>
                </div>

                {/* Time */}
                {schedule.is_time_specific && schedule.preferred_time && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Time</div>
                    <div className="text-sm font-medium text-gray-900 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {schedule.preferred_time.slice(0, 5)}
                    </div>
                  </div>
                )}

                {/* Next Occurrence */}
                {schedule.next_occurrence_date && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Next Occurrence</div>
                    <div className="text-sm font-medium text-blue-600">
                      {new Date(schedule.next_occurrence_date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                )}

                {/* Stats */}
                {schedule.stats && (
                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-gray-600">Completion:</span>
                        <span className="ml-2 font-semibold text-gray-900">
                          {schedule.stats.completion_rate}%
                        </span>
                      </div>
                      <div className="text-gray-600">
                        <span className="font-semibold text-green-600">{schedule.stats.completed}</span>
                        {' / '}
                        <span className="font-semibold text-amber-600">{schedule.stats.pending}</span>
                        {' / '}
                        <span>{schedule.stats.total_occurrences}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <ScheduledConnectionForm
          schedule={editingSchedule}
          onClose={() => {
            setShowForm(false);
            setEditingSchedule(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingSchedule(null);
            loadSchedules();
          }}
        />
      )}
      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        variant="danger"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
