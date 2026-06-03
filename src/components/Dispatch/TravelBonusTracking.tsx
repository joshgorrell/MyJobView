import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, DollarSign, Check, X, Clock, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface TravelLog {
  id: string;
  technician_id: string;
  appointment_id: string | null;
  start_location: {
    lat: number;
    lng: number;
    address: string;
  };
  end_location: {
    lat: number;
    lng: number;
    address: string;
  };
  distance_miles: number;
  travel_time_minutes: number;
  bonus_amount: number;
  status: string;
  date: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  technician: {
    full_name: string;
  };
  appointment?: {
    title: string;
  };
  approver?: {
    full_name: string;
  };
}

export function TravelBonusTracking() {
  const { profile } = useAuth();
  const [travelLogs, setTravelLogs] = useState<TravelLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadTravelLogs();

    const channel = supabase
      .channel('travel-logs-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'travel_logs'
      }, () => {
        loadTravelLogs();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [dateRange]);

  async function loadTravelLogs() {
    try {
      const { data, error } = await supabase
        .from('travel_logs')
        .select(`
          *,
          technician:profiles!technician_id(full_name),
          appointment:appointments!appointment_id(title),
          approver:profiles!approved_by(full_name)
        `)
        .gte('date', dateRange.start)
        .lte('date', dateRange.end)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTravelLogs(data || []);
    } catch (error) {
      console.error('Error loading travel logs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function approveTravel(logId: string) {
    try {
      const { error } = await supabase
        .from('travel_logs')
        .update({
          status: 'approved',
          approved_by: profile?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', logId);

      if (error) throw error;
      loadTravelLogs();
    } catch (error) {
      console.error('Error approving travel:', error);
    }
  }

  async function rejectTravel(logId: string) {
    try {
      const { error } = await supabase
        .from('travel_logs')
        .update({
          status: 'rejected',
          approved_by: profile?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', logId);

      if (error) throw error;
      loadTravelLogs();
    } catch (error) {
      console.error('Error rejecting travel:', error);
    }
  }

  const filteredLogs = filter === 'all'
    ? travelLogs
    : travelLogs.filter(log => log.status === filter);

  const stats = {
    pending: {
      count: travelLogs.filter(l => l.status === 'pending').length,
      total: travelLogs.filter(l => l.status === 'pending').reduce((sum, l) => sum + Number(l.bonus_amount), 0)
    },
    approved: {
      count: travelLogs.filter(l => l.status === 'approved').length,
      total: travelLogs.filter(l => l.status === 'approved').reduce((sum, l) => sum + Number(l.bonus_amount), 0)
    },
    paid: {
      count: travelLogs.filter(l => l.status === 'paid').length,
      total: travelLogs.filter(l => l.status === 'paid').reduce((sum, l) => sum + Number(l.bonus_amount), 0)
    }
  };

  const canApprove = profile?.role === 'admin' || profile?.role === 'office_manager';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading travel logs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Travel Bonus Tracking</h2>
          <p className="text-gray-300">
            Distance-based compensation for technician travel
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-yellow-700 font-medium">Pending Approval</div>
              <div className="text-2xl font-bold text-yellow-900 mt-1">
                ${stats.pending.total.toFixed(2)}
              </div>
              <div className="text-xs text-yellow-600 mt-1">{stats.pending.count} trips</div>
            </div>
            <Clock className="w-8 h-8 text-yellow-600" />
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-green-700 font-medium">Approved</div>
              <div className="text-2xl font-bold text-green-900 mt-1">
                ${stats.approved.total.toFixed(2)}
              </div>
              <div className="text-xs text-green-600 mt-1">{stats.approved.count} trips</div>
            </div>
            <Check className="w-8 h-8 text-green-600" />
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-blue-700 font-medium">Paid</div>
              <div className="text-2xl font-bold text-blue-900 mt-1">
                ${stats.paid.total.toFixed(2)}
              </div>
              <div className="text-xs text-blue-600 mt-1">{stats.paid.count} trips</div>
            </div>
            <DollarSign className="w-8 h-8 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 text-sm font-medium ${
            filter === 'all'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 text-sm font-medium ${
            filter === 'pending'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Pending ({stats.pending.count})
        </button>
        <button
          onClick={() => setFilter('approved')}
          className={`px-4 py-2 text-sm font-medium ${
            filter === 'approved'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Approved ({stats.approved.count})
        </button>
        <button
          onClick={() => setFilter('paid')}
          className={`px-4 py-2 text-sm font-medium ${
            filter === 'paid'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Paid ({stats.paid.count})
        </button>
      </div>

      {/* Travel Logs List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Technician</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Distance</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Bonus</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                {canApprove && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(log.date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {log.technician.full_name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {log.appointment?.title || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <div>{log.start_location.address}</div>
                        <div className="text-xs text-gray-500 mt-1">to</div>
                        <div>{log.end_location.address}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {log.distance_miles.toFixed(1)} mi
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {log.travel_time_minutes} min
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                    ${log.bonus_amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      log.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : log.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : log.status === 'paid'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  {canApprove && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {log.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => approveTravel(log.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                            title="Approve"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => rejectTravel(log.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            title="Reject"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {log.status === 'approved' && log.approver && (
                        <div className="text-xs text-gray-500">
                          By {log.approver.full_name}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={canApprove ? 9 : 8} className="px-6 py-12 text-center text-gray-500">
                    No travel logs found
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
