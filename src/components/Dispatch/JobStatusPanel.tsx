import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  MapPin,
  Navigation,
  Clock,
  AlertCircle,
  CheckCircle,
  Truck,
  Home,
  Flag,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Filter
} from 'lucide-react';

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  current_location_status: string | null;
  needs_info: boolean;
  blocked_reason: string | null;
  estimated_arrival: string | null;
  arrived_at: string | null;
  departed_at: string | null;
  last_status_update: string;
  address: string | null;
  assigned_to: string;
  profiles: {
    id: string;
    full_name: string;
  };
  projects: {
    project_name: string;
    contacts: {
      full_name: string;
      phone: string | null;
    };
  };
}

interface StatusUpdate {
  work_order_id: string;
  old_status: string | null;
  new_status: string;
  location_status: string | null;
  notes: string | null;
  created_at: string;
  profiles: {
    full_name: string;
  } | null;
}

export function JobStatusPanel() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedWO, setSelectedWO] = useState<string | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadWorkOrders();

    const channel = supabase
      .channel('job-status-panel')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_orders'
      }, loadWorkOrders)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'job_status_history'
      }, () => {
        if (selectedWO) {
          loadStatusHistory(selectedWO);
        }
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [filterStatus]);

  useEffect(() => {
    if (selectedWO) {
      loadStatusHistory(selectedWO);
    }
  }, [selectedWO]);

  async function loadWorkOrders() {
    try {
      let query = supabase
        .from('work_orders')
        .select(`
          *,
          profiles!work_orders_assigned_to_fkey (
            id,
            full_name
          ),
          projects (
            project_name,
            contacts (
              full_name,
              phone
            )
          )
        `)
        .not('assigned_to', 'is', null)
        .order('last_status_update', { ascending: false });

      if (filterStatus === 'active') {
        query = query.in('status', ['assigned', 'in_progress']);
      } else if (filterStatus === 'needs_attention') {
        query = query.eq('needs_info', true);
      } else if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (error) {
      console.error('Error loading work orders:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStatusHistory(workOrderId: string) {
    try {
      const { data, error } = await supabase
        .from('job_status_history')
        .select(`
          *,
          profiles (
            full_name
          )
        `)
        .eq('work_order_id', workOrderId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setStatusHistory(data || []);
    } catch (error) {
      console.error('Error loading status history:', error);
    }
  }

  function getLocationStatusIcon(status: string | null) {
    switch (status) {
      case 'en_route':
        return <Navigation className="w-5 h-5 text-blue-400" />;
      case 'on_site':
        return <MapPin className="w-5 h-5 text-green-400" />;
      case 'traveling_between':
        return <Truck className="w-5 h-5 text-purple-400" />;
      case 'at_shop':
        return <Home className="w-5 h-5 text-gray-400" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  }

  function getLocationStatusLabel(status: string | null) {
    switch (status) {
      case 'en_route':
        return 'En Route';
      case 'on_site':
        return 'On Site';
      case 'traveling_between':
        return 'Traveling Between Jobs';
      case 'at_shop':
        return 'At Shop';
      default:
        return 'Unknown';
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'assigned':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'in_progress':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'completed':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  }

  function formatTimeAgo(timestamp: string) {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading job status...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Live Job Status</h2>
          <p className="text-gray-400 text-sm mt-1">
            Real-time tracking of {workOrders.length} active {workOrders.length === 1 ? 'job' : 'jobs'}
          </p>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <Filter className="w-4 h-4" />
          Filters
          {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {showFilters && (
        <div className="bg-gray-800 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">Filter by Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="active">Active Jobs</option>
            <option value="needs_attention">Needs Attention</option>
            <option value="all">All Jobs</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      )}

      {workOrders.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">All Clear!</h3>
          <p className="text-gray-400">No active jobs to track.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {workOrders.map((wo) => (
            <div
              key={wo.id}
              className={`bg-gray-800 rounded-lg border transition-colors ${
                selectedWO === wo.id ? 'border-blue-500' : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-gray-500">{wo.work_order_number}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(wo.status)}`}>
                        {wo.status.replace('_', ' ').toUpperCase()}
                      </span>
                      {wo.needs_info && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                          <AlertCircle className="w-3 h-3" />
                          NEEDS INFO
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-white mb-1">{wo.title}</div>
                    <div className="text-sm text-gray-400">
                      {wo.projects.contacts.full_name} • {wo.profiles.full_name}
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedWO(selectedWO === wo.id ? null : wo.id)}
                    className="px-3 py-1.5 bg-gray-700 text-white rounded text-sm hover:bg-gray-600 transition-colors"
                  >
                    {selectedWO === wo.id ? 'Less' : 'Details'}
                  </button>
                </div>

                {wo.current_location_status && (
                  <div className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg mb-3">
                    {getLocationStatusIcon(wo.current_location_status)}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">
                        {getLocationStatusLabel(wo.current_location_status)}
                      </div>
                      <div className="text-xs text-gray-400">
                        Updated {formatTimeAgo(wo.last_status_update)}
                      </div>
                    </div>
                  </div>
                )}

                {wo.estimated_arrival && !wo.arrived_at && (
                  <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                    <Clock className="w-4 h-4" />
                    ETA: {new Date(wo.estimated_arrival).toLocaleTimeString()}
                  </div>
                )}

                {wo.arrived_at && !wo.departed_at && (
                  <div className="flex items-center gap-2 text-sm text-green-400 mb-2">
                    <Flag className="w-4 h-4" />
                    Arrived: {new Date(wo.arrived_at).toLocaleTimeString()}
                  </div>
                )}

                {wo.blocked_reason && (
                  <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-red-400">Blocked</div>
                      <div className="text-sm text-red-300">{wo.blocked_reason}</div>
                    </div>
                  </div>
                )}

                {selectedWO === wo.id && statusHistory.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Status History
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {statusHistory.map((history, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-2 bg-gray-900 rounded text-sm"
                        >
                          <div className="flex-1">
                            <div className="text-white">
                              {history.old_status && (
                                <span className="text-gray-400">{history.old_status}</span>
                              )}
                              {history.old_status && ' → '}
                              <span className="font-medium">{history.new_status}</span>
                            </div>
                            {history.location_status && (
                              <div className="text-xs text-gray-400 mt-1">
                                Location: {getLocationStatusLabel(history.location_status)}
                              </div>
                            )}
                            {history.notes && (
                              <div className="text-xs text-gray-300 mt-1">{history.notes}</div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 whitespace-nowrap">
                            {formatTimeAgo(history.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
