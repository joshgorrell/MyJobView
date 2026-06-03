import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Search, Filter, Clock, Calendar, User, AlertCircle, Camera, Wrench, CheckCircle, X, Mail, MailCheck, Phone, PhoneOff, ArrowUpDown, ArrowDown, ArrowUp, Repeat } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { CreateWorkOrderModal } from './CreateWorkOrderModal';

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  start_date: string;
  target_completion_date: string;
  estimated_hours: number;
  actual_hours: number;
  assigned_to: string | null;
  created_by: string | null;
  feedback_email_sent: boolean;
  feedback_email_sent_at: string | null;
  project: {
    name: string;
    project_number: string;
    customer_name: string;
  };
  technician?: {
    full_name: string;
  };
  sales_rep?: {
    full_name: string;
  };
  created_at: string;
  parts_count?: number;
  photos_count?: number;
  pending_parts?: number;
  is_completed?: boolean;
  customer_contacted: boolean;
  is_recurring_parent?: boolean;
  recurrence_parent_id?: string | null;
}

interface Profile {
  id: string;
  full_name: string;
}

interface WorkOrdersListProps {
  onSelectWorkOrder?: (workOrderId: string) => void;
}

export function WorkOrdersList({ onSelectWorkOrder }: WorkOrdersListProps) {
  const { profile } = useAuth();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [salesRepFilter, setSalesRepFilter] = useState<string[]>([]);
  const [techFilter, setTechFilter] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [salesReps, setSalesReps] = useState<Profile[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    loadWorkOrders();
    loadUsers();

    const channel = supabase
      .channel('work-orders-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_orders'
      }, () => {
        loadWorkOrders();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [sortDir]);

  async function loadUsers() {
    try {
      // Load sales reps
      const { data: salesData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['sales', 'sales_v2', 'admin', 'office_manager'])
        .order('full_name');

      if (salesData) setSalesReps(salesData);

      // Load technicians
      const { data: techData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['technician', 'field_tech', 'project_manager'])
        .order('full_name');

      if (techData) setTechnicians(techData);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function loadWorkOrders() {
    try {
      let query = supabase
        .from('work_orders')
        .select(`
          *,
          project:projects(name, project_number, customer_name),
          technician:profiles!assigned_to(full_name),
          sales_rep:profiles!created_by(full_name)
        `)
        .order('created_at', { ascending: sortDir === 'asc' });

      if (profile?.role === 'technician' || profile?.role === 'field_tech') {
        query = query.eq('assigned_to', profile.id);
      }

      const { data: woData, error: woError } = await query;
      if (woError) throw woError;

      const workOrdersWithCounts = await Promise.all(
        (woData || []).map(async (wo) => {
          const [partsResult, photosResult, completionResult] = await Promise.all([
            supabase
              .from('parts_requests')
              .select('id, status')
              .eq('work_order_id', wo.id),
            supabase
              .from('job_photos')
              .select('id')
              .eq('work_order_id', wo.id),
            supabase
              .from('job_completions')
              .select('id')
              .eq('work_order_id', wo.id)
              .maybeSingle()
          ]);

          return {
            ...wo,
            parts_count: partsResult.data?.length || 0,
            pending_parts: partsResult.data?.filter(p => p.status === 'pending').length || 0,
            photos_count: photosResult.data?.length || 0,
            is_completed: !!completionResult.data
          };
        })
      );

      setWorkOrders(workOrdersWithCounts);
    } catch (error) {
      console.error('Error loading work orders:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'assigned':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'on_hold':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  function getPriorityBorder(priority: string) {
    switch (priority) {
      case 'urgent':
        return 'border-l-4 border-red-500';
      case 'high':
        return 'border-l-4 border-orange-500';
      case 'medium':
        return 'border-l-4 border-yellow-500';
      default:
        return 'border-l-4 border-gray-300';
    }
  }

  function toggleStatusFilter(status: string) {
    setStatusFilter(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  }

  function toggleSalesRepFilter(repId: string) {
    setSalesRepFilter(prev =>
      prev.includes(repId)
        ? prev.filter(id => id !== repId)
        : [...prev, repId]
    );
  }

  function toggleTechFilter(techId: string) {
    setTechFilter(prev =>
      prev.includes(techId)
        ? prev.filter(id => id !== techId)
        : [...prev, techId]
    );
  }

  function clearFilters() {
    setStatusFilter([]);
    setSalesRepFilter([]);
    setTechFilter([]);
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
  }

  const filteredWorkOrders = workOrders.filter(wo => {
    const matchesSearch =
      wo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.work_order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.project?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.project?.customer_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(wo.status);
    const matchesSalesRep = salesRepFilter.length === 0 || (wo.created_by && salesRepFilter.includes(wo.created_by));
    const matchesTech = techFilter.length === 0 || (wo.assigned_to && techFilter.includes(wo.assigned_to));

    const matchesDateRange = (() => {
      if (!startDate && !endDate) return true;
      const woDate = new Date(wo.start_date || wo.created_at);
      if (startDate && woDate < new Date(startDate)) return false;
      if (endDate && woDate > new Date(endDate)) return false;
      return true;
    })();

    return matchesSearch && matchesStatus && matchesSalesRep && matchesTech && matchesDateRange;
  });

  const hasActiveFilters = statusFilter.length > 0 || salesRepFilter.length > 0 || techFilter.length > 0 || startDate !== '' || endDate !== '' || searchTerm !== '';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading work orders...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Work Orders</h2>
        <p className="text-gray-300">
          {filteredWorkOrders.length} of {workOrders.length} work order{workOrders.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-0 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by number, title, project, or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          title={sortDir === 'desc' ? 'Newest first — click to sort oldest first' : 'Oldest first — click to sort newest first'}
        >
          {sortDir === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
          Date {sortDir === 'desc' ? '(Newest)' : '(Oldest)'}
        </button>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors whitespace-nowrap ${
            showFilters
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {hasActiveFilters && (
            <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs">
              {statusFilter.length + salesRepFilter.length + techFilter.length + (startDate ? 1 : 0) + (endDate ? 1 : 0)}
            </span>
          )}
        </button>
        {(profile?.role === 'admin' || profile?.role === 'office_manager' || profile?.role === 'project_manager') && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Work Order
          </button>
        )}
      </div>

      {showFilters && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Filters</h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <div className="flex flex-wrap gap-2">
                {['pending', 'assigned', 'in_progress', 'completed', 'on_hold', 'cancelled'].map(status => (
                  <button
                    key={status}
                    onClick={() => toggleStatusFilter(status)}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                      statusFilter.includes(status)
                        ? getStatusColor(status)
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {status.replace('_', ' ')}
                    {statusFilter.includes(status) && (
                      <span className="ml-1">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sales Rep</label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {salesReps.map(rep => (
                  <label key={rep.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={salesRepFilter.includes(rep.id)}
                      onChange={() => toggleSalesRepFilter(rep.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{rep.full_name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Technician</label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {technicians.map(tech => (
                  <label key={tech.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={techFilter.includes(tech.id)}
                      onChange={() => toggleTechFilter(tech.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{tech.full_name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
              <div className="space-y-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  placeholder="Start date"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  placeholder="End date"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {filteredWorkOrders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No work orders found
            </h3>
            <p className="text-gray-300">
              {hasActiveFilters ? 'Try adjusting your filters' : 'Create a new work order to get started'}
            </p>
          </div>
        ) : (
          filteredWorkOrders.map(wo => (
            <div
              key={wo.id}
              onClick={() => onSelectWorkOrder?.(wo.id)}
              className={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer ${getPriorityBorder(wo.priority)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-gray-900">{wo.work_order_number}</span>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(wo.status)}`}>
                      {wo.status.replace('_', ' ')}
                    </span>
                    {wo.is_completed && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        <CheckCircle className="w-3 h-3" />
                        Completed
                      </span>
                    )}
                    {wo.status === 'completed' && wo.feedback_email_sent && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
                        title={`Feedback email sent ${wo.feedback_email_sent_at ? new Date(wo.feedback_email_sent_at).toLocaleString() : ''}`}
                      >
                        <MailCheck className="w-3 h-3" />
                        Feedback Sent
                      </span>
                    )}
                    {wo.priority === 'urgent' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                        <AlertCircle className="w-3 h-3" />
                        Urgent
                      </span>
                    )}
                    {wo.customer_contacted ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full text-xs font-semibold">
                        <Phone className="w-3 h-3" />
                        Confirmed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 border border-red-300 rounded-full text-xs font-semibold">
                        <PhoneOff className="w-3 h-3" />
                        Not Contacted
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    {wo.title}
                    {(wo.is_recurring_parent || wo.recurrence_parent_id) && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        <Repeat className="w-3 h-3" />
                        {wo.is_recurring_parent ? 'Recurring' : 'Series'}
                      </span>
                    )}
                  </h3>

                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                    <span>{wo.project?.project_number}</span>
                    <span>•</span>
                    <span>{wo.project?.name}</span>
                    <span>•</span>
                    <span>{wo.project?.customer_name}</span>
                  </div>

                  {wo.description && (
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">{wo.description}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    {wo.assigned_to && wo.technician && (
                      <div className="flex items-center gap-1 text-sm text-gray-700">
                        <User className="w-4 h-4" />
                        {wo.technician.full_name}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-sm text-gray-700">
                      <Calendar className="w-4 h-4" />
                      {wo.target_completion_date ? new Date(wo.target_completion_date).toLocaleDateString() : 'No due date'}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-700">
                      <Clock className="w-4 h-4" />
                      {wo.actual_hours}/{wo.estimated_hours}h
                    </div>
                    {wo.parts_count! > 0 && (
                      <div className="flex items-center gap-1 text-sm text-gray-700">
                        <Wrench className="w-4 h-4 text-orange-600" />
                        <span>{wo.parts_count} part{wo.parts_count !== 1 ? 's' : ''}</span>
                        {wo.pending_parts! > 0 && (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs ml-1">
                            {wo.pending_parts} pending
                          </span>
                        )}
                      </div>
                    )}
                    {wo.photos_count! > 0 && (
                      <div className="flex items-center gap-1 text-sm text-blue-700">
                        <Camera className="w-4 h-4" />
                        {wo.photos_count} photo{wo.photos_count !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <CreateWorkOrderModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={loadWorkOrders}
        />
      )}
    </div>
  );
}
