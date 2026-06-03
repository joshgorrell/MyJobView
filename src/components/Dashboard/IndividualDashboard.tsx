import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import VehicleMileageWidget from './VehicleMileageWidget';
import { AwaitingContactWidget } from './AwaitingContactWidget';
import {
  TrendingUp,
  Users,
  Phone,
  Target,
  CheckCircle,
  AlertCircle,
  Flame,
  Calendar,
  Download,
  RefreshCw
} from 'lucide-react';

interface DashboardMetrics {
  contactsAdded7d: number;
  contactsAdded30d: number;
  connectionsLogged7d: number;
  connectionsLogged30d: number;
  connectionMix: { type: string; count: number; percentage: number }[];
  avgConnectionsPerContact: number;
  leadsCreated7d: number;
  leadsCreated30d: number;
  contactToLeadConversion7d: number;
  contactToLeadConversion30d: number;
  tasksCreated7d: number;
  tasksCreated30d: number;
  taskCompletionRate: number;
  openTasksAging: number;
  staleContacts: number;
  hotStreak: number;
}

export function IndividualDashboard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadMetrics = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const now = new Date();
      const date7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const date30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const date90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Contacts Added
      const { count: contacts7d } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', profile.id)
        .gte('created_at', date7d.toISOString());

      const { count: contacts30d } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', profile.id)
        .gte('created_at', date30d.toISOString());

      // Connections Logged
      const { count: connections7d } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', profile.id)
        .gte('connection_date', date7d.toISOString());

      const { count: connections30d } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', profile.id)
        .gte('connection_date', date30d.toISOString());

      // Connection Mix
      const { data: allConnections } = await supabase
        .from('connections')
        .select('connection_type')
        .eq('created_by', profile.id)
        .gte('connection_date', date30d.toISOString());

      const connectionTypes = allConnections?.reduce((acc: any, conn) => {
        acc[conn.connection_type] = (acc[conn.connection_type] || 0) + 1;
        return acc;
      }, {});

      const totalConnections = allConnections?.length || 0;
      const connectionMix = Object.entries(connectionTypes || {}).map(([type, count]) => ({
        type,
        count: count as number,
        percentage: totalConnections > 0 ? ((count as number) / totalConnections) * 100 : 0
      }));

      // Avg Connections per Contact
      const { data: contactConnections } = await supabase
        .from('connections')
        .select('contact_id')
        .eq('created_by', profile.id);

      const uniqueContacts = new Set(contactConnections?.map(c => c.contact_id)).size;
      const avgConnectionsPerContact = uniqueContacts > 0
        ? (contactConnections?.length || 0) / uniqueContacts
        : 0;

      // Leads Created
      const { count: leads7d } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', profile.id)
        .gte('created_at', date7d.toISOString());

      const { count: leads30d } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', profile.id)
        .gte('created_at', date30d.toISOString());

      // Contact to Lead Conversion Rate
      const contactToLeadConversion7d = contacts7d && contacts7d > 0
        ? ((leads7d || 0) / contacts7d) * 100
        : 0;

      const contactToLeadConversion30d = contacts30d && contacts30d > 0
        ? ((leads30d || 0) / contacts30d) * 100
        : 0;

      // Tasks Created
      const { count: tasks7d } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .gte('created_at', date7d.toISOString());

      const { count: tasks30d } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .gte('created_at', date30d.toISOString());

      // Task Completion Rate
      const { count: completedTasks } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('status', 'completed');

      const { count: totalTasks } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id);

      const taskCompletionRate = totalTasks && totalTasks > 0
        ? ((completedTasks || 0) / totalTasks) * 100
        : 0;

      // Open Tasks Aging
      const { data: openTasks } = await supabase
        .from('tasks')
        .select('due_date')
        .eq('user_id', profile.id)
        .neq('status', 'completed')
        .not('due_date', 'is', null)
        .lt('due_date', now.toISOString());

      const openTasksAging = openTasks && openTasks.length > 0
        ? openTasks.reduce((sum, task) => {
            const dueDate = new Date(task.due_date!);
            const aging = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            return sum + aging;
          }, 0) / openTasks.length
        : 0;

      // Stale Contacts
      const { data: contactsWithConnections } = await supabase
        .from('contacts')
        .select(`
          id,
          connections (
            connection_date
          )
        `)
        .eq('created_by', profile.id);

      const staleContacts = contactsWithConnections?.filter(contact => {
        if (!contact.connections || contact.connections.length === 0) return true;
        const lastConnection = contact.connections
          .map((c: any) => new Date(c.connection_date))
          .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];
        return lastConnection && (now.getTime() - lastConnection.getTime()) > (30 * 24 * 60 * 60 * 1000);
      }).length || 0;

      // Hot Streak
      const { data: streakConnections } = await supabase
        .from('connections')
        .select('connection_date')
        .eq('created_by', profile.id)
        .gte('connection_date', date90d.toISOString())
        .order('connection_date', { ascending: false });

      const connectionDays = new Set(
        streakConnections?.map(c => new Date(c.connection_date).toDateString())
      );

      let hotStreak = 0;
      let currentDate = new Date();
      while (connectionDays.has(currentDate.toDateString())) {
        hotStreak++;
        currentDate.setDate(currentDate.getDate() - 1);
      }

      setMetrics({
        contactsAdded7d: contacts7d || 0,
        contactsAdded30d: contacts30d || 0,
        connectionsLogged7d: connections7d || 0,
        connectionsLogged30d: connections30d || 0,
        connectionMix,
        avgConnectionsPerContact,
        leadsCreated7d: leads7d || 0,
        leadsCreated30d: leads30d || 0,
        contactToLeadConversion7d,
        contactToLeadConversion30d,
        tasksCreated7d: tasks7d || 0,
        tasksCreated30d: tasks30d || 0,
        taskCompletionRate,
        openTasksAging,
        staleContacts,
        hotStreak
      });

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, [profile, dateRange]);

  const handleExport = () => {
    if (!metrics) return;

    const csvData = [
      ['Metric', '7 Days', '30 Days'],
      ['Contacts Added', metrics.contactsAdded7d, metrics.contactsAdded30d],
      ['Connections Logged', metrics.connectionsLogged7d, metrics.connectionsLogged30d],
      ['Leads Created', metrics.leadsCreated7d, metrics.leadsCreated30d],
      ['Contact→Lead Conversion %', metrics.contactToLeadConversion7d.toFixed(1), metrics.contactToLeadConversion30d.toFixed(1)],
      ['Tasks Created', metrics.tasksCreated7d, metrics.tasksCreated30d],
      ['Task Completion %', '', metrics.taskCompletionRate.toFixed(1)],
      ['Avg Connections per Contact', '', metrics.avgConnectionsPerContact.toFixed(2)],
      ['Open Tasks Aging (days)', '', metrics.openTasksAging.toFixed(1)],
      ['Stale Contacts', '', metrics.staleContacts],
      ['Hot Streak (days)', '', metrics.hotStreak]
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-performance-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading your performance data...</p>
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
            <h1 className="text-2xl font-bold text-gray-400">My Performance at a Glance</h1>
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

        <div className="flex flex-wrap gap-2 mb-4">
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-6 h-6 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Contacts Added</h3>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="text-4xl font-bold text-gray-900">{metrics.contactsAdded30d}</div>
            <div className="text-sm text-gray-500">
              {metrics.contactsAdded7d} in last 7d
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Phone className="w-6 h-6 text-green-600" />
            <h3 className="font-semibold text-gray-900">Connections Logged</h3>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="text-4xl font-bold text-gray-900">{metrics.connectionsLogged30d}</div>
            <div className="text-sm text-gray-500">
              {metrics.connectionsLogged7d} in last 7d
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Target className="w-6 h-6 text-orange-600" />
            <h3 className="font-semibold text-gray-900">Avg Connections/Contact</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">
            {metrics.avgConnectionsPerContact.toFixed(1)}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Leads Created</h3>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="text-4xl font-bold text-gray-900">{metrics.leadsCreated30d}</div>
            <div className="text-sm text-gray-500">
              {metrics.leadsCreated7d} in last 7d
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Target className="w-6 h-6 text-green-600" />
            <h3 className="font-semibold text-gray-900">Contact→Lead Conversion</h3>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="text-4xl font-bold text-gray-900">
              {metrics.contactToLeadConversion30d.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500">
              {metrics.contactToLeadConversion7d.toFixed(1)}% in last 7d
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-6 h-6 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Tasks Created</h3>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="text-4xl font-bold text-gray-900">{metrics.tasksCreated30d}</div>
            <div className="text-sm text-gray-500">
              {metrics.tasksCreated7d} in last 7d
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <h3 className="font-semibold text-gray-900">Task Completion Rate</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">
            {metrics.taskCompletionRate.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-6 h-6 text-orange-600" />
            <h3 className="font-semibold text-gray-900">Open Tasks Aging</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">
            {metrics.openTasksAging.toFixed(0)} days
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-6 h-6 text-red-600" />
            <h3 className="font-semibold text-gray-900">Stale Contacts</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">{metrics.staleContacts}</div>
          <p className="text-sm text-gray-500 mt-1">No contact in 30+ days</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Flame className="w-6 h-6 text-orange-600" />
            <h3 className="font-semibold text-gray-900">Hot Streak</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">{metrics.hotStreak}</div>
          <p className="text-sm text-gray-500 mt-1">Days with connections</p>
        </div>

        <VehicleMileageWidget onNavigateToMileage={() => {
          onNavigate?.('my_mileage');
        }} />
      </div>

      <AwaitingContactWidget onNavigate={onNavigate} />

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Connection Mix</h3>
        <div className="space-y-3">
          {metrics.connectionMix.map((item) => (
            <div key={item.type}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700 capitalize">{item.type}</span>
                <span className="text-gray-900 font-medium">
                  {item.count} ({item.percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${item.percentage}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
