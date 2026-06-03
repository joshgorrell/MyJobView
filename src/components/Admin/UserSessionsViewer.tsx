import { useEffect, useState } from 'react';
import { Activity, Clock, Users, Eye, Monitor, Calendar, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDistanceToNow } from '../../lib/utils';

interface UserSession {
  id: string;
  user_id: string;
  session_start: string;
  session_end: string | null;
  last_activity: string;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean;
  duration_seconds: number;
  profiles: {
    full_name: string;
    email: string;
    role: string;
  };
}

interface UserStats {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  total_sessions: number;
  total_time_seconds: number;
  last_seen: string | null;
  is_online: boolean;
}

export function UserSessionsViewer() {
  const [activeSessions, setActiveSessions] = useState<UserSession[]>([]);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [activeTab, setActiveTab] = useState<'active' | 'stats'>('active');

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 30000);

    const channel = supabase
      .channel('sessions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_sessions' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [timeRange]);

  async function loadData() {
    try {
      await Promise.all([
        loadActiveSessions(),
        loadUserStats()
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveSessions() {
    // First, cleanup stale sessions (inactive for 30+ minutes)
    await supabase.rpc('cleanup_stale_sessions');

    // Then load active sessions
    const { data, error } = await supabase
      .from('user_sessions')
      .select(`
        *,
        profiles:user_id (
          full_name,
          email,
          role
        )
      `)
      .eq('is_active', true)
      .order('last_activity', { ascending: false });

    if (error) {
      console.error('Error loading active sessions:', error);
      return;
    }

    setActiveSessions(data || []);
  }

  async function loadUserStats() {
    let query = supabase
      .from('user_sessions')
      .select(`
        user_id,
        duration_seconds,
        session_end,
        profiles:user_id (
          full_name,
          email,
          role
        )
      `);

    const now = new Date();
    if (timeRange === 'today') {
      const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      query = query.gte('session_start', startOfDay);
    } else if (timeRange === 'week') {
      const weekAgo = new Date(now.setDate(now.getDate() - 7)).toISOString();
      query = query.gte('session_start', weekAgo);
    } else if (timeRange === 'month') {
      const monthAgo = new Date(now.setMonth(now.getMonth() - 1)).toISOString();
      query = query.gte('session_start', monthAgo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading user stats:', error);
      return;
    }

    const statsMap = new Map<string, UserStats>();

    data?.forEach((session: any) => {
      const userId = session.user_id;
      if (!statsMap.has(userId)) {
        statsMap.set(userId, {
          user_id: userId,
          full_name: session.profiles.full_name,
          email: session.profiles.email,
          role: session.profiles.role,
          total_sessions: 0,
          total_time_seconds: 0,
          last_seen: null,
          is_online: false,
        });
      }

      const stats = statsMap.get(userId)!;
      stats.total_sessions += 1;
      stats.total_time_seconds += session.duration_seconds || 0;
    });

    const { data: lastSeenData } = await supabase
      .from('user_sessions')
      .select('user_id, last_activity, is_active')
      .order('last_activity', { ascending: false });

    lastSeenData?.forEach((session: any) => {
      if (statsMap.has(session.user_id)) {
        const stats = statsMap.get(session.user_id)!;
        if (!stats.last_seen || new Date(session.last_activity) > new Date(stats.last_seen)) {
          stats.last_seen = session.last_activity;
          stats.is_online = session.is_active;
        }
      }
    });

    const statsArray = Array.from(statsMap.values())
      .sort((a, b) => b.total_time_seconds - a.total_time_seconds);

    setUserStats(statsArray);
  }

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  function formatTotalTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading session data...</div>
      </div>
    );
  }

  const totalActiveUsers = activeSessions.length;
  const totalTimeToday = userStats.reduce((sum, user) => sum + user.total_time_seconds, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-900">
          <Activity className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold">User Sessions & Activity</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-800">Active Now</p>
              <p className="text-3xl font-bold text-green-900 mt-1">{totalActiveUsers}</p>
            </div>
            <div className="p-3 bg-green-500 rounded-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-800">Total Users</p>
              <p className="text-3xl font-bold text-blue-900 mt-1">{userStats.length}</p>
            </div>
            <div className="p-3 bg-blue-500 rounded-lg">
              <Eye className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-800">Total Time ({timeRange})</p>
              <p className="text-3xl font-bold text-purple-900 mt-1">{formatTotalTime(totalTimeToday)}</p>
            </div>
            <div className="p-3 bg-purple-500 rounded-lg">
              <Clock className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 flex-wrap gap-3">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveTab('active')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'active'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Active Sessions
              </button>
              <button
                onClick={() => setActiveTab('stats')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'stats'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Usage Statistics
              </button>
            </div>

            {activeTab === 'stats' && (
              <div className="flex gap-2">
                {(['today', 'week', 'month', 'all'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      timeRange === range
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {range.charAt(0).toUpperCase() + range.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'active' ? (
            <div className="space-y-4">
              {activeSessions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No active sessions</p>
                </div>
              ) : (
                activeSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 flex-wrap gap-3">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{session.profiles.full_name}</div>
                        <div className="text-sm text-gray-500">{session.profiles.email}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                            {session.profiles.role}
                          </span>
                          {session.ip_address && (
                            <span className="text-xs text-gray-500">
                              IP: {session.ip_address}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <Clock className="w-4 h-4" />
                        <span>{formatDuration(session.duration_seconds)}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Active {formatDistanceToNow(session.last_activity)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sessions</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Time</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {userStats.map((user) => (
                    <tr key={user.user_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900">{user.full_name}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${user.is_online ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                          <span className="text-sm text-gray-600">
                            {user.is_online ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-gray-900">{user.total_sessions}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-gray-900">{formatTotalTime(user.total_time_seconds)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-gray-500">
                          {user.last_seen ? formatDistanceToNow(user.last_seen) : 'Never'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {userStats.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No usage data for selected period</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
