import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Calendar,
  Clock,
  User,
  MapPin,
  Filter,
  Download,
  Printer,
  Search,
  SortAsc,
  SortDesc,
  ChevronDown
} from 'lucide-react';

interface ScheduleItem {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  work_order_number: string;
  technician_name: string;
  technician_id: string;
  customer_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  priority: string;
  status: string;
  type: string;
  estimated_duration: number;
  phone: string;
}

type SortField = 'date' | 'time' | 'technician' | 'priority' | 'status';
type SortDirection = 'asc' | 'desc';

export function ScheduleListView() {
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTech, setFilterTech] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    return future.toISOString().split('T')[0];
  });
  const [technicians, setTechnicians] = useState<Array<{ id: string; full_name: string }>>([]);

  useEffect(() => {
    loadScheduleData();
    loadTechnicians();
  }, [startDate, endDate]);

  useEffect(() => {
    filterAndSortData();
  }, [scheduleItems, searchTerm, filterTech, filterStatus, filterPriority, sortField, sortDirection]);

  async function loadTechnicians() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['tech', 'lead_tech'])
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      if (data) setTechnicians(data);
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  }

  async function loadScheduleData() {
    try {
      const { data: workOrders, error } = await supabase
        .from('work_orders')
        .select(`
          id,
          work_order_number,
          scheduled_date,
          scheduled_start_time,
          scheduled_end_time,
          assigned_to,
          priority,
          status,
          estimated_duration,
          work_order_type,
          project:projects (
            project_name,
            contacts (
              full_name,
              company_name,
              phone,
              address_line1,
              city,
              state,
              zip
            )
          ),
          technician:profiles!assigned_to (
            id,
            full_name
          )
        `)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .not('assigned_to', 'is', null)
        .order('scheduled_date')
        .order('scheduled_start_time');

      if (error) throw error;

      const items: ScheduleItem[] = (workOrders || []).map((wo: any) => ({
        id: wo.id,
        date: wo.scheduled_date || '',
        start_time: wo.scheduled_start_time || '',
        end_time: wo.scheduled_end_time || '',
        work_order_number: wo.work_order_number,
        technician_name: wo.technician?.full_name || 'Unassigned',
        technician_id: wo.assigned_to || '',
        customer_name: wo.project?.contacts?.full_name || wo.project?.contacts?.company_name || 'Unknown',
        address: wo.project?.contacts?.address_line1 || '',
        city: wo.project?.contacts?.city || '',
        state: wo.project?.contacts?.state || '',
        zip: wo.project?.contacts?.zip || '',
        priority: wo.priority || 'normal',
        status: wo.status || 'pending',
        type: wo.work_order_type || 'service',
        estimated_duration: wo.estimated_duration || 0,
        phone: wo.project?.contacts?.phone || ''
      }));

      setScheduleItems(items);
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      setLoading(false);
    }
  }

  function filterAndSortData() {
    let filtered = [...scheduleItems];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.work_order_number.toLowerCase().includes(term) ||
        item.customer_name.toLowerCase().includes(term) ||
        item.technician_name.toLowerCase().includes(term) ||
        item.address.toLowerCase().includes(term)
      );
    }

    if (filterTech !== 'all') {
      filtered = filtered.filter(item => item.technician_id === filterTech);
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(item => item.status === filterStatus);
    }

    if (filterPriority !== 'all') {
      filtered = filtered.filter(item => item.priority === filterPriority);
    }

    filtered.sort((a, b) => {
      let compareA: any, compareB: any;

      switch (sortField) {
        case 'date':
          compareA = `${a.date} ${a.start_time}`;
          compareB = `${b.date} ${b.start_time}`;
          break;
        case 'time':
          compareA = a.start_time;
          compareB = b.start_time;
          break;
        case 'technician':
          compareA = a.technician_name;
          compareB = b.technician_name;
          break;
        case 'priority':
          const priorityOrder: any = { critical: 1, high: 2, medium: 3, normal: 4, low: 5 };
          compareA = priorityOrder[a.priority] || 999;
          compareB = priorityOrder[b.priority] || 999;
          break;
        case 'status':
          compareA = a.status;
          compareB = b.status;
          break;
      }

      if (compareA < compareB) return sortDirection === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredItems(filtered);
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  function exportToCSV() {
    const headers = ['Date', 'Time', 'Work Order', 'Technician', 'Customer', 'Address', 'City', 'State', 'Zip', 'Phone', 'Duration', 'Priority', 'Status', 'Type'];
    const csvRows = [headers.join(',')];

    filteredItems.forEach(item => {
      const row = [
        item.date,
        item.start_time,
        item.work_order_number,
        item.technician_name,
        `"${item.customer_name}"`,
        `"${item.address}"`,
        item.city,
        item.state,
        item.zip,
        item.phone,
        `${item.estimated_duration}m`,
        item.priority,
        item.status,
        item.type
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule-${startDate}-to-${endDate}.csv`;
    a.click();
  }

  function printSchedule() {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Schedule - ${startDate} to ${endDate}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { font-size: 24px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f3f4f6; font-weight: bold; }
            .priority-critical { background-color: #fee; }
            .priority-high { background-color: #fef3e7; }
            @media print {
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Dispatch Schedule: ${startDate} to ${endDate}</h1>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>WO#</th>
                <th>Technician</th>
                <th>Customer</th>
                <th>Address</th>
                <th>City/State</th>
                <th>Phone</th>
                <th>Duration</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredItems.map(item => `
                <tr class="priority-${item.priority}">
                  <td>${new Date(item.date).toLocaleDateString()}</td>
                  <td>${item.start_time}</td>
                  <td>${item.work_order_number}</td>
                  <td>${item.technician_name}</td>
                  <td>${item.customer_name}</td>
                  <td>${item.address}</td>
                  <td>${item.city}, ${item.state}</td>
                  <td>${item.phone}</td>
                  <td>${item.estimated_duration}m</td>
                  <td>${item.priority}</td>
                  <td>${item.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <button onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; cursor: pointer;">Print</button>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />;
  };

  const getPriorityBadge = (priority: string) => {
    const colors: any = {
      critical: 'bg-red-100 text-red-800 border-red-300',
      high: 'bg-orange-100 text-orange-800 border-orange-300',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      normal: 'bg-gray-100 text-gray-800 border-gray-300',
      low: 'bg-blue-100 text-blue-800 border-blue-300'
    };
    return colors[priority] || colors.normal;
  };

  const getStatusBadge = (status: string) => {
    const colors: any = {
      pending: 'bg-yellow-100 text-yellow-800',
      assigned: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-purple-100 text-purple-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || colors.pending;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading schedule...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-white">Schedule List View</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={printSchedule}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Technician</label>
            <select
              value={filterTech}
              onChange={(e) => setFilterTech(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Technicians</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by work order, customer, technician, or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="text-sm text-blue-900">
          Showing <span className="font-bold">{filteredItems.length}</span> of <span className="font-bold">{scheduleItems.length}</span> scheduled jobs
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  onClick={() => handleSort('date')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    Date <SortIcon field="date" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('time')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    Time <SortIcon field="time" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Work Order
                </th>
                <th
                  onClick={() => handleSort('technician')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    Technician <SortIcon field="technician" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Duration
                </th>
                <th
                  onClick={() => handleSort('priority')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    Priority <SortIcon field="priority" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    Status <SortIcon field="status" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      {item.start_time || 'TBD'}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      #{item.work_order_number}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-900">{item.technician_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">{item.customer_name}</div>
                    {item.phone && (
                      <div className="text-xs text-gray-500">{item.phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="text-sm text-gray-900">
                        <div>{item.address}</div>
                        <div className="text-gray-500">{item.city}, {item.state} {item.zip}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {item.estimated_duration}m
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getPriorityBadge(item.priority)}`}>
                      {item.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(item.status)}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredItems.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No scheduled jobs found</p>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
