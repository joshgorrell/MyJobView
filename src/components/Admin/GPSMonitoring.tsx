import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, CheckCircle, XCircle, Clock, TrendingUp, AlertTriangle } from 'lucide-react';

interface GPSStats {
  total_entries: number;
  with_gps: number;
  without_gps: number;
  high_accuracy: number;
  network: number;
  cached: number;
  failed: number;
  none: number;
  avg_capture_time: number;
  avg_accuracy: number;
}

interface ClockEntry {
  id: string;
  technician_id: string;
  technician_name: string;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_in_gps_capture_method: string | null;
  clock_in_gps_accuracy: number | null;
  clock_in_gps_duration_ms: number | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
  clock_out_gps_capture_method: string | null;
  clock_out_gps_accuracy: number | null;
  clock_out_gps_duration_ms: number | null;
}

export function GPSMonitoring() {
  const [stats, setStats] = useState<GPSStats | null>(null);
  const [recentEntries, setRecentEntries] = useState<ClockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('week');

  useEffect(() => {
    loadGPSStats();
    loadRecentEntries();
  }, [timeRange]);

  async function loadGPSStats() {
    try {
      const startDate = getStartDate(timeRange);

      const { data, error } = await supabase
        .from('daily_clock_entries')
        .select('clock_out_gps_capture_method, clock_out_gps_duration_ms, clock_out_gps_accuracy')
        .gte('entry_date', startDate)
        .not('clock_out', 'is', null);

      if (error) throw error;

      if (data) {
        const total = data.length;
        const methodCounts = {
          high_accuracy: 0,
          network: 0,
          cached: 0,
          failed: 0,
          none: 0,
        };

        let totalDuration = 0;
        let totalAccuracy = 0;
        let accuracyCount = 0;
        let durationCount = 0;

        data.forEach((entry) => {
          const method = entry.clock_out_gps_capture_method;
          if (method && method in methodCounts) {
            methodCounts[method as keyof typeof methodCounts]++;
          } else {
            methodCounts.none++;
          }

          if (entry.clock_out_gps_duration_ms) {
            totalDuration += entry.clock_out_gps_duration_ms;
            durationCount++;
          }

          if (entry.clock_out_gps_accuracy) {
            totalAccuracy += entry.clock_out_gps_accuracy;
            accuracyCount++;
          }
        });

        const withGPS = methodCounts.high_accuracy + methodCounts.network + methodCounts.cached;
        const withoutGPS = methodCounts.failed + methodCounts.none;

        setStats({
          total_entries: total,
          with_gps: withGPS,
          without_gps: withoutGPS,
          ...methodCounts,
          avg_capture_time: durationCount > 0 ? totalDuration / durationCount : 0,
          avg_accuracy: accuracyCount > 0 ? totalAccuracy / accuracyCount : 0,
        });
      }
    } catch (error) {
      console.error('Error loading GPS stats:', error);
    }
  }

  async function loadRecentEntries() {
    try {
      const startDate = getStartDate(timeRange);

      const { data, error } = await supabase
        .from('daily_clock_entries')
        .select(`
          id,
          technician_id,
          entry_date,
          clock_in,
          clock_out,
          clock_in_latitude,
          clock_in_longitude,
          clock_in_gps_capture_method,
          clock_in_gps_accuracy,
          clock_in_gps_duration_ms,
          clock_out_latitude,
          clock_out_longitude,
          clock_out_gps_capture_method,
          clock_out_gps_accuracy,
          clock_out_gps_duration_ms,
          technician:profiles!daily_clock_entries_technician_id_fkey(full_name)
        `)
        .gte('entry_date', startDate)
        .order('clock_out', { ascending: false, nullsFirst: false })
        .limit(50);

      if (error) throw error;

      if (data) {
        const entries = data.map((entry: any) => ({
          ...entry,
          technician_name: entry.technician?.full_name || 'Unknown',
        }));
        setRecentEntries(entries);
      }
    } catch (error) {
      console.error('Error loading recent entries:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStartDate(range: string): string {
    const now = new Date();
    switch (range) {
      case 'today':
        return now.toISOString().split('T')[0];
      case 'week':
        const weekAgo = new Date(now.setDate(now.getDate() - 7));
        return weekAgo.toISOString().split('T')[0];
      case 'month':
        const monthAgo = new Date(now.setDate(now.getDate() - 30));
        return monthAgo.toISOString().split('T')[0];
      default:
        return now.toISOString().split('T')[0];
    }
  }

  function getMethodBadge(method: string | null) {
    if (!method || method === 'none') {
      return <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">No GPS</span>;
    }
    if (method === 'high_accuracy') {
      return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">High Accuracy</span>;
    }
    if (method === 'network') {
      return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Network</span>;
    }
    if (method === 'cached') {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">Cached</span>;
    }
    if (method === 'failed') {
      return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Failed</span>;
    }
    return <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">{method}</span>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading GPS monitoring data...</div>
      </div>
    );
  }

  const successRate = stats ? ((stats.with_gps / stats.total_entries) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">GPS Monitoring</h2>
          <p className="text-sm text-gray-600 mt-1">
            Monitor GPS capture success rates and troubleshoot location tracking issues
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange('today')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              timeRange === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTimeRange('week')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              timeRange === 'week'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setTimeRange('month')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              timeRange === 'month'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">GPS Success Rate</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{successRate}%</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.with_gps} of {stats.total_entries} clock-outs
                  </p>
                </div>
                <TrendingUp className={`w-8 h-8 ${parseFloat(successRate) >= 90 ? 'text-green-500' : parseFloat(successRate) >= 70 ? 'text-yellow-500' : 'text-red-500'}`} />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Capture Time</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {(stats.avg_capture_time / 1000).toFixed(1)}s
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.avg_capture_time < 5000 ? 'Excellent' : stats.avg_capture_time < 8000 ? 'Good' : 'Slow'}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Accuracy</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {Math.round(stats.avg_accuracy)}m
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.avg_accuracy < 20 ? 'Excellent' : stats.avg_accuracy < 50 ? 'Good' : 'Fair'}
                  </p>
                </div>
                <MapPin className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Failed Captures</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {stats.failed + stats.none}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {((((stats.failed + stats.none) / stats.total_entries) * 100) || 0).toFixed(1)}% failure rate
                  </p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">GPS Capture Methods</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.high_accuracy}</div>
                <div className="text-xs text-gray-600 mt-1">High Accuracy</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.network}</div>
                <div className="text-xs text-gray-600 mt-1">Network</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{stats.cached}</div>
                <div className="text-xs text-gray-600 mt-1">Cached</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                <div className="text-xs text-gray-600 mt-1">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{stats.none}</div>
                <div className="text-xs text-gray-600 mt-1">None</div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Clock-Out Entries</h3>
          <p className="text-sm text-gray-600 mt-1">
            Showing the most recent {recentEntries.length} clock-out entries with GPS details
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Technician
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Clock Out
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  GPS Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Accuracy
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Capture Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {entry.technician_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(entry.entry_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {entry.clock_out ? new Date(entry.clock_out).toLocaleTimeString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getMethodBadge(entry.clock_out_gps_capture_method)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {entry.clock_out_gps_accuracy ? `${Math.round(entry.clock_out_gps_accuracy)}m` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {entry.clock_out_gps_duration_ms ? `${(entry.clock_out_gps_duration_ms / 1000).toFixed(1)}s` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {entry.clock_out_latitude && entry.clock_out_longitude ? (
                      <a
                        href={`https://www.google.com/maps?q=${entry.clock_out_latitude},${entry.clock_out_longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <MapPin className="w-4 h-4" />
                        View
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
              {recentEntries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                    No clock-out entries found for the selected time range
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
