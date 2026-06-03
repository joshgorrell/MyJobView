import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useDepartments } from '../../contexts/DepartmentContext';
import {
  TrendingUp,
  Users,
  Phone,
  Target,
  Download,
  RefreshCw,
  BarChart3,
  Trophy,
  Award
} from 'lucide-react';

interface TeamMetrics {
  totalContactsAdded30d: number;
  totalConnectionsLogged30d: number;
  connectionsByType: { type: string; count: number }[];
  connectionsPerRep: number;
  totalLeadsCreated: number;
  leadCreationRate: number;
  totalPointsAwarded: number;
  repBreakdown: {
    repId: string;
    repName: string;
    contacts: number;
    connections: number;
    leads: number;
    points: number;
  }[];
}

export function TeamLeaderboard() {
  const { profile } = useAuth();
  const { hasModuleAccess } = useDepartments();
  const [metrics, setMetrics] = useState<TeamMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);

  const formatConnectionType = (type: string): string => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const loadMetrics = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const now = new Date();
      const date30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const date7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const date90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      let dateFilter = date30d;
      if (dateRange === '7d') dateFilter = date7d;
      if (dateRange === '90d') dateFilter = date90d;

      // Get all reps
      const { data: allReps } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');

      setReps(allReps?.map(r => ({ id: r.id, name: r.full_name })) || []);

      // Build filters
      let repFilter = selectedRep !== 'all' ? selectedRep : null;

      // Total Contacts Added
      let contactsQuery = supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', dateFilter.toISOString());

      if (repFilter) {
        contactsQuery = contactsQuery.eq('created_by', repFilter);
      }

      const { count: totalContacts } = await contactsQuery;

      // Total Connections Logged
      let connectionsQuery = supabase
        .from('connections')
        .select('connection_type, user_id')
        .gte('connection_date', dateFilter.toISOString());

      if (repFilter) {
        connectionsQuery = connectionsQuery.eq('user_id', repFilter);
      }

      const { data: allConnections } = await connectionsQuery;

      const connectionsByType = Object.entries(
        allConnections?.reduce((acc: any, conn) => {
          acc[conn.connection_type] = (acc[conn.connection_type] || 0) + 1;
          return acc;
        }, {}) || {}
      ).map(([type, count]) => ({ type, count: count as number }));

      // Connections per Rep
      const { data: repConnectionCounts } = await supabase
        .from('connections')
        .select('user_id')
        .gte('connection_date', dateFilter.toISOString());

      const uniqueReps = new Set(repConnectionCounts?.map(c => c.user_id)).size;
      const connectionsPerRep = uniqueReps > 0
        ? (allConnections?.length || 0) / uniqueReps
        : 0;

      // Total Leads Created
      let leadsQuery = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });

      if (repFilter) {
        leadsQuery = leadsQuery.eq('created_by', repFilter);
      }

      const { count: totalLeads } = await leadsQuery;

      // Lead Creation Rate
      const leadCreationRate = totalContacts && totalContacts > 0
        ? ((totalLeads || 0) / totalContacts) * 100
        : 0;

      // Get total points awarded in period
      const { data: pointsData } = await supabase
        .from('points_transactions')
        .select('points_amount')
        .gte('created_at', dateFilter.toISOString());

      const totalPointsAwarded = pointsData?.reduce((sum, t) => sum + (t.points_amount > 0 ? t.points_amount : 0), 0) || 0;

      // Rep Breakdown - fetch all data in bulk instead of per-rep queries
      const repIds = (allReps || []).map(r => r.id);

      const [bulkContacts, bulkConnections, bulkLeads, bulkPoints] = await Promise.all([
        supabase
          .from('contacts')
          .select('created_by')
          .in('created_by', repIds)
          .gte('created_at', dateFilter.toISOString()),
        supabase
          .from('connections')
          .select('user_id')
          .in('user_id', repIds)
          .gte('connection_date', dateFilter.toISOString()),
        supabase
          .from('leads')
          .select('created_by')
          .in('created_by', repIds),
        supabase
          .from('points_transactions')
          .select('user_id, points_amount')
          .in('user_id', repIds)
          .gte('created_at', dateFilter.toISOString())
      ]);

      // Aggregate counts per rep using in-memory maps (single pass each)
      const contactCountMap: Record<string, number> = {};
      (bulkContacts.data || []).forEach(r => {
        contactCountMap[r.created_by] = (contactCountMap[r.created_by] || 0) + 1;
      });

      const connectionCountMap: Record<string, number> = {};
      (bulkConnections.data || []).forEach(r => {
        connectionCountMap[r.user_id] = (connectionCountMap[r.user_id] || 0) + 1;
      });

      const leadCountMap: Record<string, number> = {};
      (bulkLeads.data || []).forEach(r => {
        leadCountMap[r.created_by] = (leadCountMap[r.created_by] || 0) + 1;
      });

      const pointsMap: Record<string, number> = {};
      (bulkPoints.data || []).forEach(r => {
        if (r.points_amount > 0) {
          pointsMap[r.user_id] = (pointsMap[r.user_id] || 0) + r.points_amount;
        }
      });

      const repBreakdown = (allReps || []).map(rep => ({
        repId: rep.id,
        repName: rep.full_name,
        contacts: contactCountMap[rep.id] || 0,
        connections: connectionCountMap[rep.id] || 0,
        leads: leadCountMap[rep.id] || 0,
        points: pointsMap[rep.id] || 0,
      }));

      setMetrics({
        totalContactsAdded30d: totalContacts || 0,
        totalConnectionsLogged30d: allConnections?.length || 0,
        connectionsByType,
        connectionsPerRep,
        totalLeadsCreated: totalLeads || 0,
        leadCreationRate,
        totalPointsAwarded,
        repBreakdown: repBreakdown.sort((a, b) => b.points - a.points)
      });

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading team metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, [profile, dateRange, selectedRep]);

  const handleExport = () => {
    if (!metrics) return;

    const csvData = [
      ['Team Performance Metrics'],
      [''],
      ['Total Contacts Added', metrics.totalContactsAdded30d],
      ['Total Connections Logged', metrics.totalConnectionsLogged30d],
      ['Connections per Rep (Avg)', metrics.connectionsPerRep.toFixed(2)],
      ['Total Leads Created', metrics.totalLeadsCreated],
      ['Lead Creation Rate %', metrics.leadCreationRate.toFixed(1)],
      [''],
      ['Total Points Awarded', metrics.totalPointsAwarded],
      [''],
      ['Connection Types'],
      ...metrics.connectionsByType.map(item => [item.type, item.count]),
      [''],
      ['Rep Breakdown'],
      ['Rep Name', 'Contacts', 'Connections', 'Leads', 'Points Earned'],
      ...metrics.repBreakdown.map(rep => [
        rep.repName,
        rep.contacts,
        rep.connections,
        rep.leads,
        rep.points
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-performance-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const topPerformers = useMemo(
    () => metrics?.repBreakdown.filter(rep => rep.points > 0).slice(0, 5) ?? [],
    [metrics?.repBreakdown]
  );

  const activeReps = useMemo(
    () => metrics?.repBreakdown.filter(rep => rep.contacts > 0 || rep.connections > 0 || rep.leads > 0 || rep.points > 0) ?? [],
    [metrics?.repBreakdown]
  );

  if (!profile || !hasModuleAccess('team_leaderboard')) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <p className="text-gray-300">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading team performance data...</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <p className="text-gray-300">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-400">Team Pulse</h1>
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadMetrics}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setDateRange('7d')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                dateRange === '7d'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setDateRange('30d')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                dateRange === '30d'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setDateRange('90d')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                dateRange === '90d'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              90 Days
            </button>
          </div>

          <select
            value={selectedRep}
            onChange={(e) => setSelectedRep(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Reps</option>
            {reps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-6 h-6 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Total Contacts Added</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">
            {metrics.totalContactsAdded30d}
          </div>
          <p className="text-sm text-gray-500 mt-1">Rolling {dateRange}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Phone className="w-6 h-6 text-green-600" />
            <h3 className="font-semibold text-gray-900">Total Connections Logged</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">
            {metrics.totalConnectionsLogged30d}
          </div>
          <p className="text-sm text-gray-500 mt-1">Rolling {dateRange}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-6 h-6 text-orange-600" />
            <h3 className="font-semibold text-gray-900">Connections per Rep</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">
            {metrics.connectionsPerRep.toFixed(1)}
          </div>
          <p className="text-sm text-gray-500 mt-1">Average</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Target className="w-6 h-6 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Total Leads Created</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">
            {metrics.totalLeadsCreated}
          </div>
          <p className="text-sm text-gray-500 mt-1">All time</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-6 h-6 text-green-600" />
            <h3 className="font-semibold text-gray-900">Lead Creation Rate</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">
            {metrics.leadCreationRate.toFixed(1)}%
          </div>
          <p className="text-sm text-gray-500 mt-1">Rolling {dateRange}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-6 h-6 text-yellow-600" />
            <h3 className="font-semibold text-gray-900">Points Awarded</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">
            {metrics.totalPointsAwarded.toLocaleString()}
          </div>
          <p className="text-sm text-gray-500 mt-1">Rolling {dateRange}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Connection Types Breakdown</h3>
          <div className="space-y-3">
            {metrics.connectionsByType.length > 0 ? (
              metrics.connectionsByType.map((item) => (
                <div key={item.type}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{formatConnectionType(item.type)}</span>
                    <span className="text-gray-900 font-medium">{item.count}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{
                        width: `${
                          (item.count / metrics.totalConnectionsLogged30d) * 100
                        }%`
                      }}
                    ></div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No connections logged yet</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-yellow-600" />
            <h3 className="font-semibold text-gray-900">Top Performers</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">Ranked by points earned in this period</p>
          <div className="space-y-3">
            {topPerformers.length > 0 ? (
              topPerformers.map((rep, index) => {
                const medalColor = index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-600' : 'bg-blue-600';
                return (
                  <div
                    key={rep.repId}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${medalColor} text-white flex items-center justify-center font-bold`}>
                        {index + 1}
                      </div>
                      <div>
                        <span className="font-medium text-gray-900 block">{rep.repName}</span>
                        <span className="text-xs text-gray-500">{rep.connections} connections</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-yellow-600 font-bold">
                      <Award className="w-4 h-4" />
                      <span>{rep.points}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No points earned yet in this period</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Team Activity Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Rep Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Contacts
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Connections
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Leads
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Points
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Conversion %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {activeReps.map((rep) => (
                  <tr key={rep.repId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {rep.repName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {rep.contacts}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {rep.connections}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {rep.leads}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-yellow-600">
                      {rep.points}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {rep.contacts > 0
                        ? ((rep.leads / rep.contacts) * 100).toFixed(1)
                        : '0.0'}%
                    </td>
                  </tr>
                ))}
              {activeReps.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    No activity recorded yet in this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
