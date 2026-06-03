import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, TrendingUp, TrendingDown, Activity, Download, RefreshCw, Calendar } from 'lucide-react';

interface TechnicianStats {
  technician_id: string;
  full_name: string;
  role: string;
  total_clock_entries: number;
  clock_in_gps_attempts: number;
  clock_in_gps_success: number;
  clock_in_success_rate: number;
  avg_clock_in_accuracy: number;
  avg_clock_out_accuracy: number;
  avg_clock_in_quality_score: number;
  avg_clock_out_quality_score: number;
  high_accuracy_count: number;
  network_count: number;
  cached_count: number;
  failed_count: number;
  clock_in_refined_count: number;
  clock_out_refined_count: number;
  avg_capture_duration_ms: number;
  last_gps_capture: string | null;
}

interface DailyStats {
  entry_date: string;
  unique_technicians: number;
  total_clock_entries: number;
  successful_captures: number;
  success_rate: number;
  avg_accuracy: number;
  avg_quality_score: number;
  high_accuracy_count: number;
  network_count: number;
  cached_count: number;
  failed_count: number;
}

export function GPSDiagnostics() {
  const [technicianStats, setTechnicianStats] = useState<TechnicianStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('30');

  useEffect(() => {
    loadStatistics();
  }, [dateRange]);

  async function loadStatistics() {
    setLoading(true);
    try {
      // Load technician statistics
      const { data: techData, error: techError } = await supabase
        .from('gps_capture_stats_by_technician')
        .select('*')
        .order('clock_in_success_rate', { ascending: false, nullsFirst: false });

      if (techError) throw techError;
      setTechnicianStats(techData || []);

      // Load daily statistics
      const { data: dailyData, error: dailyError } = await supabase
        .from('gps_capture_stats_by_day')
        .select('*')
        .gte('entry_date', new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('entry_date', { ascending: false });

      if (dailyError) throw dailyError;
      setDailyStats(dailyData || []);
    } catch (error) {
      console.error('Error loading GPS diagnostics:', error);
    } finally {
      setLoading(false);
    }
  }

  function getQualityBadgeColor(score: number | null): string {
    if (!score) return 'bg-gray-100 text-gray-800';
    if (score >= 90) return 'bg-green-100 text-green-800 border-green-300';
    if (score >= 70) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (score >= 50) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-red-100 text-red-800 border-red-300';
  }

  function getQualityLabel(score: number | null): string {
    if (!score) return 'N/A';
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
  }

  function getAccuracyBadgeColor(accuracy: number | null): string {
    if (!accuracy) return 'bg-gray-100 text-gray-800';
    if (accuracy < 50) return 'bg-green-100 text-green-800 border-green-300';
    if (accuracy < 200) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (accuracy < 500) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-red-100 text-red-800 border-red-300';
  }

  function exportToCSV() {
    const headers = ['Technician', 'Role', 'Clock Entries', 'Success Rate', 'Avg Accuracy (m)', 'Quality Score', 'High Accuracy', 'Network', 'Cached', 'Failed', 'Refined', 'Avg Duration (ms)'];
    const rows = technicianStats.map(stat => [
      stat.full_name,
      stat.role,
      stat.total_clock_entries,
      `${stat.clock_in_success_rate || 0}%`,
      stat.avg_clock_in_accuracy?.toFixed(1) || 'N/A',
      stat.avg_clock_in_quality_score || 'N/A',
      stat.high_accuracy_count,
      stat.network_count,
      stat.cached_count,
      stat.failed_count,
      stat.clock_in_refined_count + stat.clock_out_refined_count,
      stat.avg_capture_duration_ms?.toFixed(0) || 'N/A'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gps-diagnostics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  const overallStats = {
    totalCaptures: dailyStats.reduce((sum, day) => sum + day.total_clock_entries, 0),
    avgSuccessRate: dailyStats.length > 0
      ? (dailyStats.reduce((sum, day) => sum + (day.success_rate || 0), 0) / dailyStats.length).toFixed(1)
      : '0',
    avgAccuracy: dailyStats.length > 0
      ? (dailyStats.reduce((sum, day) => sum + (day.avg_accuracy || 0), 0) / dailyStats.length).toFixed(1)
      : '0',
    avgQualityScore: dailyStats.length > 0
      ? Math.round(dailyStats.reduce((sum, day) => sum + (day.avg_quality_score || 0), 0) / dailyStats.length)
      : 0
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading GPS diagnostics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">GPS Diagnostics</h1>
          <p className="text-gray-600 mt-1">Monitor GPS capture health and reliability</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as '7' | '30' | '90')}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <button
            onClick={loadStatistics}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Overall Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-sm text-gray-600">Total Captures</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{overallStats.totalCaptures}</div>
          <div className="text-xs text-gray-500 mt-1">Last {dateRange} days</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-sm text-gray-600">Avg Success Rate</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{overallStats.avgSuccessRate}%</div>
          <div className="text-xs text-gray-500 mt-1">System-wide average</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <MapPin className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="text-sm text-gray-600">Avg Accuracy</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{overallStats.avgAccuracy}m</div>
          <div className="text-xs text-gray-500 mt-1">Average capture accuracy</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${getQualityBadgeColor(overallStats.avgQualityScore).replace('text-', 'text-').replace('border-', '')}`}>
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="text-sm text-gray-600">Quality Score</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{overallStats.avgQualityScore}</div>
          <div className="text-xs text-gray-500 mt-1">{getQualityLabel(overallStats.avgQualityScore)}</div>
        </div>
      </div>

      {/* Technician Statistics Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Technician GPS Performance</h2>
          <p className="text-sm text-gray-600 mt-1">Individual GPS capture statistics by technician</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Technician</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Entries</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Success Rate</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Avg Accuracy</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Quality Score</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Methods</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Refined</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Avg Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {technicianStats.map((stat) => (
                <tr key={stat.technician_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{stat.full_name}</div>
                    <div className="text-xs text-gray-500 capitalize">{stat.role.replace('_', ' ')}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="text-sm font-medium text-gray-900">{stat.total_clock_entries}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${
                      (stat.clock_in_success_rate || 0) >= 95 ? 'bg-green-100 text-green-800 border-green-300' :
                      (stat.clock_in_success_rate || 0) >= 85 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                      'bg-red-100 text-red-800 border-red-300'
                    }`}>
                      {stat.clock_in_success_rate?.toFixed(1) || '0'}%
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${
                      getAccuracyBadgeColor(stat.avg_clock_in_accuracy)
                    }`}>
                      {stat.avg_clock_in_accuracy?.toFixed(1) || 'N/A'}m
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${
                      getQualityBadgeColor(stat.avg_clock_in_quality_score)
                    }`}>
                      {stat.avg_clock_in_quality_score || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">High:</span>
                        <span className="font-medium text-green-600">{stat.high_accuracy_count}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Network:</span>
                        <span className="font-medium text-blue-600">{stat.network_count}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Cached:</span>
                        <span className="font-medium text-yellow-600">{stat.cached_count}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Failed:</span>
                        <span className="font-medium text-red-600">{stat.failed_count}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="text-sm font-medium text-gray-900">
                      {stat.clock_in_refined_count + stat.clock_out_refined_count}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="text-sm text-gray-900">
                      {stat.avg_capture_duration_ms ? `${(stat.avg_capture_duration_ms / 1000).toFixed(1)}s` : 'N/A'}
                    </div>
                  </td>
                </tr>
              ))}

              {technicianStats.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No GPS data available for the selected period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Trend Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="w-5 h-5 text-gray-600" />
          <h2 className="text-xl font-bold text-gray-900">Daily GPS Capture Trend</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Technicians</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Total Captures</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Successful</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Success Rate</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Avg Accuracy</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Quality Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {dailyStats.map((stat) => (
                <tr key={stat.entry_date} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {new Date(stat.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-900">
                    {stat.unique_technicians}
                  </td>
                  <td className="px-6 py-4 text-center text-sm font-medium text-gray-900">
                    {stat.total_clock_entries}
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-green-600 font-medium">
                    {stat.successful_captures}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${
                      (stat.success_rate || 0) >= 95 ? 'bg-green-100 text-green-800 border-green-300' :
                      (stat.success_rate || 0) >= 85 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                      'bg-red-100 text-red-800 border-red-300'
                    }`}>
                      {stat.success_rate?.toFixed(1) || '0'}%
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${
                      getAccuracyBadgeColor(stat.avg_accuracy)
                    }`}>
                      {stat.avg_accuracy?.toFixed(1) || 'N/A'}m
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${
                      getQualityBadgeColor(stat.avg_quality_score)
                    }`}>
                      {stat.avg_quality_score || 'N/A'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
