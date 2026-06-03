import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { notifyTechJobAssigned, notifyTechJobReassigned } from '../../lib/dispatchNotifications';
import { WorkOrderDetail } from '../Production/WorkOrderDetail';
import {
  Briefcase,
  Calendar,
  Clock,
  MapPin,
  User,
  CheckCircle,
  Filter,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileText,
  Users,
  DollarSign,
  PhoneOff
} from 'lucide-react';

interface ProjectWorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  start_date: string | null;
  target_completion_date: string | null;
  estimated_hours: number;
  actual_hours: number;
  notes: string | null;
  internal_notes: string | null;
  created_at: string;
  address: string | null;
  customer_contacted: boolean;
  projects: {
    id: string;
    project_name: string;
    status: string;
    contacts: {
      id: string;
      company_name: string | null;
      full_name: string;
      phone: string | null;
      address_line1: string | null;
      city: string | null;
      state: string | null;
    };
  };
  profiles: {
    id: string;
    full_name: string;
  } | null;
}

interface Technician {
  id: string;
  full_name: string;
  role: string;
}

export function ProjectWorkOrdersQueue() {
  const { profile } = useAuth();
  const [workOrders, setWorkOrders] = useState<ProjectWorkOrder[]>([]);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWO, setSelectedWO] = useState<string | null>(null);
  const [expandedWO, setExpandedWO] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [assigningTo, setAssigningTo] = useState<string | null>(null);
  const [selectedTech, setSelectedTech] = useState('');
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    loadTechs();

    const channel = supabase
      .channel('project-work-orders-queue')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_orders'
      }, loadData)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [filterStatus, filterPriority]);

  async function loadData() {
    try {
      let query = supabase
        .from('work_orders')
        .select(`
          *,
          projects (
            id,
            project_name,
            status,
            contacts (
              id,
              company_name,
              full_name,
              phone,
              address_line1,
              city,
              state
            )
          ),
          profiles (
            id,
            full_name
          )
        `)
        .not('project_id', 'is', null)
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      if (filterPriority !== 'all') {
        query = query.eq('priority', filterPriority);
      }

      const { data, error } = await query;

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (error) {
      console.error('Error loading project work orders:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTechs() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('role', 'tech')
        .order('full_name');

      if (error) throw error;
      setTechs(data || []);
    } catch (error) {
      console.error('Error loading techs:', error);
    }
  }

  async function assignTechnician(woId: string, previousTechId: string | null) {
    if (!selectedTech) return;

    try {
      const wo = workOrders.find(w => w.id === woId);
      if (!wo) return;

      const { error } = await supabase
        .from('work_orders')
        .update({
          assigned_to: selectedTech,
          status: 'assigned',
          updated_at: new Date().toISOString()
        })
        .eq('id', woId);

      if (error) throw error;

      if (previousTechId && previousTechId !== selectedTech) {
        await notifyTechJobReassigned(selectedTech, {
          work_order_number: wo.work_order_number,
          title: wo.title,
          previous_tech: wo.profiles?.full_name,
          scheduled_date: wo.start_date || undefined
        });
      } else {
        await notifyTechJobAssigned(selectedTech, {
          work_order_number: wo.work_order_number,
          title: wo.title,
          customer_name: wo.projects.contacts.full_name,
          scheduled_date: wo.start_date || undefined,
          address: wo.address || wo.projects.contacts.address_line1 || undefined
        });
      }

      setAssigningTo(null);
      setSelectedTech('');
      await loadData();
    } catch (error) {
      console.error('Error assigning technician:', error);
      alert('Failed to assign technician');
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'high':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'medium':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'low':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending':
        return 'text-yellow-400 bg-yellow-500/10';
      case 'assigned':
        return 'text-blue-400 bg-blue-500/10';
      case 'in_progress':
        return 'text-purple-400 bg-purple-500/10';
      case 'completed':
        return 'text-green-400 bg-green-500/10';
      default:
        return 'text-gray-400 bg-gray-500/10';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading project work orders...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Project Work Orders</h2>
          <p className="text-gray-400 text-sm mt-1">
            {workOrders.length} project-based work {workOrders.length === 1 ? 'order' : 'orders'}
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
        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="all">All Priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {workOrders.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <Briefcase className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No Project Work Orders</h3>
          <p className="text-gray-400">
            No project work orders match your filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {workOrders.map((wo) => (
            <div
              key={wo.id}
              onClick={() => setSelectedWorkOrderId(wo.id)}
              className="bg-gray-800 rounded-lg border border-gray-700 hover:border-green-500 transition-colors cursor-pointer"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                        <Briefcase className="w-4 h-4" />
                        PROJECT WO
                      </span>

                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getPriorityColor(wo.priority)}`}>
                        {wo.priority === 'high' && <AlertCircle className="w-3.5 h-3.5" />}
                        {wo.priority.charAt(0).toUpperCase() + wo.priority.slice(1)}
                      </span>

                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(wo.status)}`}>
                        {wo.status.replace('_', ' ').charAt(0).toUpperCase() + wo.status.replace('_', ' ').slice(1)}
                      </span>

                      <span className="text-xs text-gray-500 font-mono">
                        {wo.work_order_number}
                      </span>

                      {!wo.customer_contacted && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-900/60 text-red-300 border border-red-600 rounded-full text-xs font-semibold">
                          <PhoneOff className="w-3 h-3" />
                          Not Contacted
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div>
                        <div className="font-semibold text-white text-lg">{wo.title}</div>
                        <div className="text-sm text-gray-400 mt-1">
                          Project: {wo.projects.project_name}
                        </div>
                      </div>

                      {wo.description && (
                        <div className="flex items-start gap-3">
                          <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-gray-300">{wo.description}</div>
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        <User className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-sm text-white">{wo.projects.contacts.full_name}</div>
                          {wo.projects.contacts.company_name && (
                            <div className="text-xs text-gray-400">{wo.projects.contacts.company_name}</div>
                          )}
                        </div>
                      </div>

                      {(wo.address || wo.projects.contacts.address_line1) && (
                        <div className="flex items-start gap-3">
                          <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-gray-300">
                            {wo.address || wo.projects.contacts.address_line1}
                            {wo.projects.contacts.city && `, ${wo.projects.contacts.city}`}
                            {wo.projects.contacts.state && `, ${wo.projects.contacts.state}`}
                          </div>
                        </div>
                      )}

                      {wo.profiles && (
                        <div className="flex items-center gap-3">
                          <Users className="w-5 h-5 text-gray-400 flex-shrink-0" />
                          <div className="text-sm text-white">
                            Assigned to: {wo.profiles.full_name}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
                        {wo.start_date && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            Start: {new Date(wo.start_date).toLocaleDateString()}
                          </div>
                        )}
                        {wo.target_completion_date && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            Target: {new Date(wo.target_completion_date).toLocaleDateString()}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          Est. {wo.estimated_hours}h
                        </div>
                        {wo.actual_hours > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            Actual: {wo.actual_hours}h
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-yellow-400">
                          <DollarSign className="w-3.5 h-3.5" />
                          Non-Billable
                        </div>
                      </div>

                      {wo.internal_notes && expandedWO === wo.id && (
                        <div className="mt-3 p-3 bg-gray-900 rounded border border-gray-700">
                          <div className="text-xs font-medium text-gray-400 mb-1">Internal Notes:</div>
                          <div className="text-sm text-gray-300 whitespace-pre-wrap">{wo.internal_notes}</div>
                        </div>
                      )}

                      <div className="text-xs text-gray-500">
                        Created: {new Date(wo.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {!wo.assigned_to || assigningTo === wo.id ? (
                      <div className="space-y-2">
                        <select
                          value={selectedTech}
                          onChange={(e) => setSelectedTech(e.target.value)}
                          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">Select tech...</option>
                          {techs.map(tech => (
                            <option key={tech.id} value={tech.id}>{tech.full_name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => assignTechnician(wo.id, wo.assigned_to)}
                          disabled={!selectedTech}
                          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Assign
                        </button>
                        {assigningTo === wo.id && (
                          <button
                            onClick={() => {
                              setAssigningTo(null);
                              setSelectedTech('');
                            }}
                            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAssigningTo(wo.id);
                          setSelectedTech(wo.assigned_to);
                        }}
                        className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                      >
                        Reassign
                      </button>
                    )}

                    <button
                      onClick={() => setExpandedWO(expandedWO === wo.id ? null : wo.id)}
                      className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                    >
                      {expandedWO === wo.id ? 'Less' : 'More'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedWorkOrderId && (
        <WorkOrderDetail
          workOrderId={selectedWorkOrderId}
          onClose={() => {
            setSelectedWorkOrderId(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
