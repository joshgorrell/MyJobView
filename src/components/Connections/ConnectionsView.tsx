import { useState, useEffect } from 'react';
import {
  Plus, Calendar, TrendingUp, Users, Clock, Phone, Mail, MessageSquare,
  BarChart3, CheckCircle2, AlertCircle, RefreshCw, Edit2, Trash2, Filter,
  Search, Eye, ArrowRight, Target
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConnectionForm from './ConnectionForm';
import { ScheduledConnectionsView } from './ScheduledConnectionsView';
import { PendingConnectionsWidget } from './PendingConnectionsWidget';
import ConfirmModal from '../ui/ConfirmModal';

type TabType = 'overview' | 'my-connections' | 'scheduled' | 'analytics';

interface Connection {
  id: string;
  contact_id: string;
  connection_type: string;
  connection_date: string;
  notes: string;
  follow_up_needed: boolean;
  reminder_date: string | null;
  follow_up_description: string | null;
  contact: {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    company_name: string;
  };
}

interface Stats {
  totalConnections: number;
  thisWeek: number;
  thisMonth: number;
  followUpsNeeded: number;
  activeSchedules: number;
  pendingOccurrences: number;
  completionRate: number;
}

export default function ConnectionsView() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [filteredConnections, setFilteredConnections] = useState<Connection[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalConnections: 0,
    thisWeek: 0,
    thisMonth: 0,
    followUpsNeeded: 0,
    activeSchedules: 0,
    pendingOccurrences: 0,
    completionRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterFollowUp, setFilterFollowUp] = useState<boolean | null>(null);

  useEffect(() => {
    loadData();
  }, [profile]);

  useEffect(() => {
    applyFilters();
  }, [connections, searchQuery, filterType, filterFollowUp]);

  async function loadData() {
    if (!profile) return;

    try {
      setLoading(true);
      await Promise.all([
        loadConnections(),
        loadStats()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadConnections() {
    if (!profile) return;

    const { data, error } = await supabase
      .from('connections')
      .select(`
        *,
        contact:contacts!connections_contact_id_fkey (
          id,
          first_name,
          last_name,
          full_name,
          company_name
        )
      `)
      .eq('user_id', profile.id)
      .order('connection_date', { ascending: false });

    if (!error && data) {
      setConnections(data);
    }
  }

  async function loadStats() {
    if (!profile) return;

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Load connections stats
    const { data: allConnections } = await supabase
      .from('connections')
      .select('id, connection_date, follow_up_needed')
      .eq('user_id', profile.id);

    const totalConnections = allConnections?.length || 0;
    const thisWeek = allConnections?.filter(c =>
      new Date(c.connection_date) >= weekAgo
    ).length || 0;
    const thisMonth = allConnections?.filter(c =>
      new Date(c.connection_date) >= monthAgo
    ).length || 0;
    const followUpsNeeded = allConnections?.filter(c => c.follow_up_needed).length || 0;

    // Load scheduled connections stats
    const { data: schedules } = await supabase
      .from('scheduled_connections')
      .select('id, is_active')
      .eq('created_by_user_id', profile.id);

    const activeSchedules = schedules?.filter(s => s.is_active).length || 0;

    // Load pending occurrences
    const { count: pendingCount } = await supabase
      .from('scheduled_connection_occurrences')
      .select('*', { count: 'exact', head: true })
      .eq('is_completed', false)
      .eq('is_skipped', false);

    // Calculate completion rate
    const { data: occurrences } = await supabase
      .from('scheduled_connection_occurrences')
      .select('is_completed, is_skipped')
      .in('scheduled_connection_id', schedules?.map(s => s.id) || []);

    const total = occurrences?.length || 0;
    const completed = occurrences?.filter(o => o.is_completed).length || 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    setStats({
      totalConnections,
      thisWeek,
      thisMonth,
      followUpsNeeded,
      activeSchedules,
      pendingOccurrences: pendingCount || 0,
      completionRate
    });
  }

  function applyFilters() {
    let filtered = [...connections];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.contact.full_name?.toLowerCase().includes(query) ||
        c.contact.company_name?.toLowerCase().includes(query) ||
        c.notes?.toLowerCase().includes(query) ||
        c.connection_type.toLowerCase().includes(query)
      );
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(c => c.connection_type === filterType);
    }

    // Follow-up filter
    if (filterFollowUp !== null) {
      filtered = filtered.filter(c => c.follow_up_needed === filterFollowUp);
    }

    setFilteredConnections(filtered);
  }

  async function handleDeleteConnection(connectionId: string) {
    setConfirmModal({
      title: 'Delete Connection',
      message: 'Are you sure you want to delete this connection?',
      onConfirm: async () => {
        setConfirmModal(null);
        await doDeleteConnection(connectionId);
      }
    });
  }

  async function doDeleteConnection(connectionId: string) {
    try {
      const { error } = await supabase
        .from('connections')
        .delete()
        .eq('id', connectionId);

      if (error) throw error;

      await loadData();
    } catch (error) {
      console.error('Error deleting connection:', error);
      alert('Failed to delete connection');
    }
  }

  function formatConnectionType(type: string): string {
    return type.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function getConnectionTypeIcon(type: string) {
    switch (type) {
      case 'call':
        return Phone;
      case 'email':
        return Mail;
      case 'meeting':
        return Users;
      case 'casual_conversation':
        return MessageSquare;
      default:
        return Calendar;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-300">Loading connections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Connections</h1>
          <p className="text-gray-400 mt-1">Track interactions and manage touchpoints with your network</p>
        </div>
        <button
          onClick={() => {
            setEditingConnection(null);
            setShowConnectionForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Log Connection
        </button>
      </div>

      {/* Tab Navigation - Scrollable on mobile */}
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-1 flex gap-1 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg transition-colors whitespace-nowrap text-sm sm:text-base touch-manipulation min-h-[44px] ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white font-medium'
              : 'text-white hover:bg-white/10'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">Overview</span>
        </button>
        <button
          onClick={() => setActiveTab('my-connections')}
          className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg transition-colors whitespace-nowrap text-sm sm:text-base touch-manipulation min-h-[44px] ${
            activeTab === 'my-connections'
              ? 'bg-blue-600 text-white font-medium'
              : 'text-white hover:bg-white/10'
          }`}
        >
          <Users className="w-4 h-4" />
          <span className="hidden sm:inline">My Connections</span>
          {stats.followUpsNeeded > 0 && (
            <span className="px-1.5 sm:px-2 py-0.5 bg-red-500 text-white text-xs rounded-full font-semibold">
              {stats.followUpsNeeded}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('scheduled')}
          className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg transition-colors whitespace-nowrap text-sm sm:text-base touch-manipulation min-h-[44px] ${
            activeTab === 'scheduled'
              ? 'bg-blue-600 text-white font-medium'
              : 'text-white hover:bg-white/10'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span className="hidden sm:inline">Scheduled</span>
          {stats.pendingOccurrences > 0 && (
            <span className="px-1.5 sm:px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full font-semibold">
              {stats.pendingOccurrences}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg transition-colors whitespace-nowrap text-sm sm:text-base touch-manipulation min-h-[44px] ${
            activeTab === 'analytics'
              ? 'bg-blue-600 text-white font-medium'
              : 'text-white hover:bg-white/10'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span className="hidden sm:inline">Analytics</span>
        </button>
      </div>

      <style>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-8 h-8 opacity-80" />
                <span className="text-3xl font-bold">{stats.totalConnections}</span>
              </div>
              <div className="text-sm opacity-90">Total Connections</div>
              <div className="text-xs opacity-75 mt-1">
                {stats.thisWeek} this week
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <Calendar className="w-8 h-8 opacity-80" />
                <span className="text-3xl font-bold">{stats.activeSchedules}</span>
              </div>
              <div className="text-sm opacity-90">Active Schedules</div>
              <div className="text-xs opacity-75 mt-1">
                Recurring touchpoints
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-8 h-8 opacity-80" />
                <span className="text-3xl font-bold">{stats.pendingOccurrences}</span>
              </div>
              <div className="text-sm opacity-90">Pending Today</div>
              <div className="text-xs opacity-75 mt-1">
                Need your attention
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <Target className="w-8 h-8 opacity-80" />
                <span className="text-3xl font-bold">{stats.completionRate}%</span>
              </div>
              <div className="text-sm opacity-90">Completion Rate</div>
              <div className="text-xs opacity-75 mt-1">
                {stats.followUpsNeeded} follow-ups needed
              </div>
            </div>
          </div>

          {/* Pending Connections Widget */}
          <PendingConnectionsWidget
            onComplete={async () => {
              await loadData();
            }}
            onSkip={async () => {
              await loadData();
            }}
            compact={true}
          />

          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
                <button
                  onClick={() => setActiveTab('my-connections')}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
                >
                  View All
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {connections.slice(0, 5).map((connection) => {
                const Icon = getConnectionTypeIcon(connection.connection_type);
                return (
                  <div key={connection.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">
                            {connection.contact.full_name || connection.contact.company_name}
                          </h3>
                          <span className="text-sm text-gray-500 whitespace-nowrap">
                            {new Date(connection.connection_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                          {formatConnectionType(connection.connection_type)}
                          {connection.contact.company_name && connection.contact.full_name && (
                            <span className="text-gray-400"> • {connection.contact.company_name}</span>
                          )}
                        </p>
                        {connection.notes && (
                          <p className="text-sm text-gray-500 line-clamp-2">{connection.notes}</p>
                        )}
                        {connection.follow_up_needed && (
                          <div className="flex items-center gap-1 mt-2 text-sm text-amber-600">
                            <AlertCircle className="w-4 h-4" />
                            Follow-up needed
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => {
                setEditingConnection(null);
                setShowConnectionForm(true);
              }}
              className="bg-white rounded-lg shadow-sm border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-colors p-6 text-center group"
            >
              <Plus className="w-8 h-8 text-gray-400 group-hover:text-blue-600 mx-auto mb-2" />
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600">
                Log Connection
              </h3>
              <p className="text-sm text-gray-500 mt-1">Record a new interaction</p>
            </button>

            <button
              onClick={() => setActiveTab('scheduled')}
              className="bg-white rounded-lg shadow-sm border-2 border-dashed border-gray-300 hover:border-green-500 hover:bg-green-50 transition-colors p-6 text-center group"
            >
              <Calendar className="w-8 h-8 text-gray-400 group-hover:text-green-600 mx-auto mb-2" />
              <h3 className="font-semibold text-gray-900 group-hover:text-green-600">
                Schedule Connections
              </h3>
              <p className="text-sm text-gray-500 mt-1">Set up recurring touchpoints</p>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className="bg-white rounded-lg shadow-sm border-2 border-dashed border-gray-300 hover:border-purple-500 hover:bg-purple-50 transition-colors p-6 text-center group"
            >
              <TrendingUp className="w-8 h-8 text-gray-400 group-hover:text-purple-600 mx-auto mb-2" />
              <h3 className="font-semibold text-gray-900 group-hover:text-purple-600">
                View Analytics
              </h3>
              <p className="text-sm text-gray-500 mt-1">Track your networking trends</p>
            </button>
          </div>
        </div>
      )}

      {/* My Connections Tab */}
      {activeTab === 'my-connections' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search connections..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="meeting">Meeting</option>
                <option value="call">Phone Call</option>
                <option value="email">Email</option>
                <option value="casual_conversation">Casual</option>
                <option value="other">Other</option>
              </select>

              <select
                value={filterFollowUp === null ? 'all' : filterFollowUp ? 'yes' : 'no'}
                onChange={(e) => {
                  if (e.target.value === 'all') setFilterFollowUp(null);
                  else setFilterFollowUp(e.target.value === 'yes');
                }}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Follow-ups</option>
                <option value="yes">Needs Follow-up</option>
                <option value="no">No Follow-up</option>
              </select>
            </div>
          </div>

          {/* Connections List */}
          {filteredConnections.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {connections.length === 0 ? 'No Connections Yet' : 'No Matching Connections'}
              </h3>
              <p className="text-gray-500 mb-6">
                {connections.length === 0
                  ? 'Start logging your interactions to build your network'
                  : 'Try adjusting your filters to see more connections'}
              </p>
              {connections.length === 0 && (
                <button
                  onClick={() => setShowConnectionForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Log Your First Connection
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredConnections.map((connection) => {
                const Icon = getConnectionTypeIcon(connection.connection_type);
                return (
                  <div key={connection.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-6 h-6 text-blue-600" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">
                                {connection.contact.full_name || connection.contact.company_name}
                              </h3>
                              {connection.contact.company_name && connection.contact.full_name && (
                                <p className="text-sm text-gray-600">{connection.contact.company_name}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingConnection(connection);
                                  setShowConnectionForm(true);
                                }}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit connection"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteConnection(connection.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete connection"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mb-3">
                            <span className="font-medium">{formatConnectionType(connection.connection_type)}</span>
                            <span>•</span>
                            <span>
                              {new Date(connection.connection_date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                          </div>

                          {connection.notes && (
                            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 mb-3">
                              {connection.notes}
                            </p>
                          )}

                          {connection.follow_up_needed && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 text-amber-700 mb-1">
                                <AlertCircle className="w-4 h-4" />
                                <span className="font-medium">Follow-up Needed</span>
                              </div>
                              {connection.follow_up_description && (
                                <p className="text-sm text-gray-700 ml-6">{connection.follow_up_description}</p>
                              )}
                              {connection.reminder_date && (
                                <p className="text-sm text-gray-600 ml-6 mt-1">
                                  Reminder: {new Date(connection.reminder_date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Scheduled Tab */}
      {activeTab === 'scheduled' && (
        <ScheduledConnectionsView />
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Connection Analytics</h2>

            {/* Monthly Trend */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Trend</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-3xl font-bold text-blue-600 mb-1">{stats.thisWeek}</div>
                  <div className="text-sm text-gray-600">This Week</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="text-3xl font-bold text-green-600 mb-1">{stats.thisMonth}</div>
                  <div className="text-sm text-gray-600">This Month</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <div className="text-3xl font-bold text-purple-600 mb-1">
                    {stats.thisMonth > 0 ? Math.round((stats.thisWeek / stats.thisMonth) * 100) : 0}%
                  </div>
                  <div className="text-sm text-gray-600">Week vs Month</div>
                </div>
              </div>
            </div>

            {/* Connection Types Breakdown */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Connection Types</h3>
              <div className="space-y-3">
                {Array.from(new Set(connections.map(c => c.connection_type))).map((type) => {
                  const count = connections.filter(c => c.connection_type === type).length;
                  const percentage = stats.totalConnections > 0
                    ? Math.round((count / stats.totalConnections) * 100)
                    : 0;
                  const Icon = getConnectionTypeIcon(type);

                  return (
                    <div key={type} className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-gray-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-900">{formatConnectionType(type)}</span>
                          <span className="text-sm text-gray-600">{count} ({percentage}%)</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Contacts */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Most Connected</h3>
              <div className="space-y-2">
                {Object.entries(
                  connections.reduce((acc, conn) => {
                    const key = conn.contact.full_name || conn.contact.company_name;
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                )
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-900">{name}</span>
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                        {count} connections
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connection Form Modal */}
      {showConnectionForm && (
        <ConnectionForm
          onClose={() => {
            setShowConnectionForm(false);
            setEditingConnection(null);
          }}
          onSuccess={() => {
            setShowConnectionForm(false);
            setEditingConnection(null);
            loadData();
          }}
          editConnection={editingConnection || undefined}
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
