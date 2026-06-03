import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Calendar,
  Clock,
  User,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Printer,
  Download,
  Filter,
  TrendingUp,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { CreateWorkOrderModal } from '../Production/CreateWorkOrderModal';

type ViewMode = 'day' | 'week' | 'work-week' | 'multi-week' | 'month' | 'timeline' | 'list';

interface WorkOrder {
  id: string;
  work_order_number: string;
  assigned_to: string | null;
  scheduled_date: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  status: string;
  priority: string;
  estimated_duration: number;
  project: {
    project_name: string;
    contacts: {
      full_name: string;
      address_line1: string;
      city: string;
      state: string;
    };
  };
}

interface Technician {
  id: string;
  full_name: string;
  role: string;
  employment_type: string;
  status?: {
    status: string;
    notes: string;
  };
}

interface TechCapacity {
  techId: string;
  totalMinutes: number;
  scheduledMinutes: number;
  capacity: number;
  overtime: boolean;
}

interface ScheduleSettings {
  timeSlotMinutes: number;
  startHour: number;
  endHour: number;
  showTravelTime: boolean;
  showCapacityBars: boolean;
  overtimeThreshold: number;
}

export function DispatchScheduler() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draggedWorkOrder, setDraggedWorkOrder] = useState<string | null>(null);
  const [techCapacities, setTechCapacities] = useState<Map<string, TechCapacity>>(new Map());
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ScheduleSettings>({
    timeSlotMinutes: 30,
    startHour: 7,
    endHour: 18,
    showTravelTime: true,
    showCapacityBars: true,
    overtimeThreshold: 480
  });

  useEffect(() => {
    loadScheduleData();

    const channel = supabase
      .channel('dispatcher-schedule')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_orders'
      }, () => {
        loadScheduleData();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [currentDate, viewMode]);

  useEffect(() => {
    calculateCapacities();
  }, [workOrders, technicians, currentDate, viewMode]);

  async function loadScheduleData() {
    try {
      const dateRange = getDateRange();

      const [workOrdersRes, techniciansRes] = await Promise.all([
        supabase
          .from('work_orders')
          .select(`
            id,
            work_order_number,
            assigned_to,
            scheduled_date,
            scheduled_start_time,
            scheduled_end_time,
            status,
            priority,
            estimated_duration,
            project:projects (
              project_name,
              contacts (
                full_name,
                address_line1,
                city,
                state
              )
            )
          `)
          .gte('scheduled_date', dateRange.start)
          .lte('scheduled_date', dateRange.end)
          .order('scheduled_start_time'),
        supabase
          .from('profiles')
          .select('id, full_name, role, employment_type')
          .in('role', ['tech', 'lead_tech'])
          .eq('is_active', true)
          .order('full_name')
      ]);

      if (workOrdersRes.data) setWorkOrders(workOrdersRes.data);
      if (techniciansRes.data) setTechnicians(techniciansRes.data);
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      setLoading(false);
    }
  }

  function getDateRange() {
    const start = new Date(currentDate);
    let end = new Date(currentDate);

    switch (viewMode) {
      case 'day':
        break;
      case 'week':
        start.setDate(start.getDate() - start.getDay());
        end = new Date(start);
        end.setDate(end.getDate() + 6);
        break;
      case 'work-week':
        start.setDate(start.getDate() - start.getDay() + 1);
        end = new Date(start);
        end.setDate(end.getDate() + 4);
        break;
      case 'multi-week':
        start.setDate(start.getDate() - start.getDay());
        end = new Date(start);
        end.setDate(end.getDate() + 27);
        break;
      case 'month':
        start.setDate(1);
        end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        break;
      case 'timeline':
        start.setDate(start.getDate() - start.getDay());
        end = new Date(start);
        end.setDate(end.getDate() + 13);
        break;
      case 'list':
        end.setDate(end.getDate() + 30);
        break;
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  }

  function calculateCapacities() {
    const capacities = new Map<string, TechCapacity>();
    const days = getDaysInView();

    technicians.forEach(tech => {
      days.forEach(day => {
        const dayStr = day.toISOString().split('T')[0];
        const dayJobs = workOrders.filter(
          wo => wo.assigned_to === tech.id && wo.scheduled_date === dayStr
        );

        const scheduledMinutes = dayJobs.reduce((sum, wo) => {
          return sum + (wo.estimated_duration || 60);
        }, 0);

        const totalMinutes = (settings.endHour - settings.startHour) * 60;
        const capacity = (scheduledMinutes / totalMinutes) * 100;
        const overtime = scheduledMinutes > settings.overtimeThreshold;

        const key = `${tech.id}-${dayStr}`;
        capacities.set(key, {
          techId: tech.id,
          totalMinutes,
          scheduledMinutes,
          capacity,
          overtime
        });
      });
    });

    setTechCapacities(capacities);
  }

  function getDaysInView(): Date[] {
    const days: Date[] = [];
    const start = new Date(currentDate);
    let numDays = 1;

    switch (viewMode) {
      case 'day':
        numDays = 1;
        break;
      case 'week':
        start.setDate(start.getDate() - start.getDay());
        numDays = 7;
        break;
      case 'work-week':
        start.setDate(start.getDate() - start.getDay() + 1);
        numDays = 5;
        break;
      case 'multi-week':
        start.setDate(start.getDate() - start.getDay());
        numDays = 28;
        break;
      case 'timeline':
        start.setDate(start.getDate() - start.getDay());
        numDays = 14;
        break;
      default:
        numDays = 7;
    }

    for (let i = 0; i < numDays; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      days.push(day);
    }

    return days;
  }

  function navigate(direction: 'prev' | 'next') {
    const newDate = new Date(currentDate);
    let offset = 1;

    switch (viewMode) {
      case 'day':
        offset = 1;
        break;
      case 'week':
      case 'work-week':
        offset = 7;
        break;
      case 'multi-week':
        offset = 28;
        break;
      case 'month':
        if (direction === 'next') {
          newDate.setMonth(newDate.getMonth() + 1);
        } else {
          newDate.setMonth(newDate.getMonth() - 1);
        }
        setCurrentDate(newDate);
        return;
      case 'timeline':
        offset = 14;
        break;
    }

    newDate.setDate(newDate.getDate() + (direction === 'next' ? offset : -offset));
    setCurrentDate(newDate);
  }

  async function handleDrop(technicianId: string, date: Date, startTime?: string) {
    if (!draggedWorkOrder) return;

    try {
      const updates: any = {
        assigned_to: technicianId || null,
        scheduled_date: date.toISOString().split('T')[0],
        status: technicianId ? 'assigned' : 'pending'
      };

      if (startTime) {
        updates.scheduled_start_time = startTime;
        const wo = workOrders.find(w => w.id === draggedWorkOrder);
        if (wo && wo.estimated_duration) {
          const [hours, minutes] = startTime.split(':');
          const endDate = new Date();
          endDate.setHours(parseInt(hours), parseInt(minutes) + wo.estimated_duration);
          updates.scheduled_end_time = endDate.toTimeString().slice(0, 5);
        }
      }

      const { error } = await supabase
        .from('work_orders')
        .update(updates)
        .eq('id', draggedWorkOrder);

      if (error) throw error;
      await loadScheduleData();
    } catch (error) {
      console.error('Error updating work order:', error);
    } finally {
      setDraggedWorkOrder(null);
    }
  }

  function getWorkOrdersForTechAndDate(techId: string | null, date: Date) {
    const dateStr = date.toISOString().split('T')[0];
    return workOrders.filter(
      wo => wo.assigned_to === techId && wo.scheduled_date === dateStr
    );
  }

  function getCapacityColor(capacity: number): string {
    if (capacity >= 100) return 'bg-red-500';
    if (capacity >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  function getCapacityForTechAndDate(techId: string, date: Date): TechCapacity | undefined {
    const key = `${techId}-${date.toISOString().split('T')[0]}`;
    return techCapacities.get(key);
  }

  function getPriorityColor(priority: string): string {
    switch (priority?.toLowerCase()) {
      case 'critical':
        return 'border-l-4 border-red-600 bg-red-50';
      case 'high':
        return 'border-l-4 border-orange-500 bg-orange-50';
      case 'medium':
        return 'border-l-4 border-yellow-500 bg-yellow-50';
      default:
        return 'border-l-4 border-gray-300 bg-white';
    }
  }

  function exportToCSV() {
    const days = getDaysInView();
    const csvRows: string[] = [];

    csvRows.push(['Date', 'Time', 'Work Order', 'Technician', 'Customer', 'Address', 'Priority', 'Status'].join(','));

    days.forEach(day => {
      technicians.forEach(tech => {
        const jobs = getWorkOrdersForTechAndDate(tech.id, day);
        jobs.forEach(wo => {
          csvRows.push([
            wo.scheduled_date || '',
            wo.scheduled_start_time || '',
            wo.work_order_number,
            tech.full_name,
            wo.project?.contacts?.full_name || '',
            `"${wo.project?.contacts?.address_line1 || ''}"`,
            wo.priority,
            wo.status
          ].join(','));
        });
      });
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dispatch-schedule-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading dispatch schedule...</div>
      </div>
    );
  }

  const days = getDaysInView();
  const unassignedJobs = workOrders.filter(wo => !wo.assigned_to);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Dispatch Scheduler</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('prev')}
              className="p-2 bg-white hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 text-sm font-medium bg-white text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => navigate('next')}
              className="p-2 bg-white hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Selector */}
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
            className="px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="day">Day View</option>
            <option value="week">Full Week (7 days)</option>
            <option value="work-week">Work Week (Mon-Fri)</option>
            <option value="multi-week">Multi-Week (4 weeks)</option>
            <option value="month">Month View</option>
            <option value="timeline">Timeline (2 weeks)</option>
            <option value="list">List/Agenda View</option>
          </select>

          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Work Order
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Schedule Settings</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Slot (minutes)
              </label>
              <select
                value={settings.timeSlotMinutes}
                onChange={(e) => setSettings({ ...settings, timeSlotMinutes: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="60">60 min</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Hour
              </label>
              <input
                type="number"
                min="0"
                max="23"
                value={settings.startHour}
                onChange={(e) => setSettings({ ...settings, startHour: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Hour
              </label>
              <input
                type="number"
                min="0"
                max="23"
                value={settings.endHour}
                onChange={(e) => setSettings({ ...settings, endHour: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Overtime Threshold (min)
              </label>
              <input
                type="number"
                step="30"
                value={settings.overtimeThreshold}
                onChange={(e) => setSettings({ ...settings, overtimeThreshold: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex gap-4 mt-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.showCapacityBars}
                onChange={(e) => setSettings({ ...settings, showCapacityBars: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">Show Capacity Bars</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.showTravelTime}
                onChange={(e) => setSettings({ ...settings, showTravelTime: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">Show Travel Time</span>
            </label>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{technicians.length}</div>
              <div className="text-sm text-gray-600">Technicians</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{unassignedJobs.length}</div>
              <div className="text-sm text-gray-600">Unassigned</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {workOrders.filter(wo => wo.assigned_to).length}
              </div>
              <div className="text-sm text-gray-600">Scheduled</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {Array.from(techCapacities.values()).filter(c => c.overtime).length}
              </div>
              <div className="text-sm text-gray-600">Overtime</div>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-48 z-10">
                  Technician
                </th>
                {days.map(date => (
                  <th key={date.toISOString()} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[200px]">
                    <div className="flex flex-col">
                      <span>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      <span className="text-gray-900 text-sm font-bold">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Unassigned Row */}
              <tr className="hover:bg-gray-50">
                <td className="sticky left-0 bg-white px-4 py-3 whitespace-nowrap border-r border-gray-200 z-10">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="ml-3">
                      <div className="text-sm font-medium text-gray-900">Unassigned</div>
                      <div className="text-xs text-gray-500">{unassignedJobs.length} jobs</div>
                    </div>
                  </div>
                </td>
                {days.map(date => {
                  const dateJobs = getWorkOrdersForTechAndDate(null, date);
                  return (
                    <td
                      key={date.toISOString()}
                      className="px-4 py-3 align-top"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop('', date)}
                    >
                      <div className="space-y-2">
                        {dateJobs.map(wo => (
                          <div
                            key={wo.id}
                            draggable
                            onDragStart={() => setDraggedWorkOrder(wo.id)}
                            className={`p-2 rounded text-xs cursor-move hover:shadow-md transition-shadow ${getPriorityColor(wo.priority)}`}
                          >
                            <div className="font-semibold text-gray-900">WO #{wo.work_order_number}</div>
                            <div className="text-gray-600 mt-1">{wo.project?.project_name}</div>
                            {wo.scheduled_start_time && (
                              <div className="flex items-center gap-1 text-gray-500 mt-1">
                                <Clock className="w-3 h-3" />
                                {wo.scheduled_start_time}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Technician Rows */}
              {technicians.map(tech => (
                <tr key={tech.id} className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white px-4 py-3 whitespace-nowrap border-r border-gray-200 z-10">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">{tech.full_name}</div>
                        <div className="text-xs text-gray-500">{tech.employment_type || tech.role}</div>
                      </div>
                    </div>
                  </td>
                  {days.map(date => {
                    const dateJobs = getWorkOrdersForTechAndDate(tech.id, date);
                    const capacity = getCapacityForTechAndDate(tech.id, date);

                    return (
                      <td
                        key={date.toISOString()}
                        className="px-4 py-3 align-top relative"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(tech.id, date)}
                      >
                        {settings.showCapacityBars && capacity && (
                          <div className="mb-2">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all ${getCapacityColor(capacity.capacity)}`}
                                style={{ width: `${Math.min(capacity.capacity, 100)}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {Math.round(capacity.capacity)}% ({Math.round(capacity.scheduledMinutes / 60)}h)
                              {capacity.overtime && (
                                <span className="ml-1 text-red-600 font-semibold">OT</span>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2">
                          {dateJobs.map(wo => (
                            <div
                              key={wo.id}
                              draggable
                              onDragStart={() => setDraggedWorkOrder(wo.id)}
                              className={`p-2 rounded text-xs cursor-move hover:shadow-md transition-shadow ${getPriorityColor(wo.priority)}`}
                            >
                              <div className="font-semibold text-gray-900">WO #{wo.work_order_number}</div>
                              <div className="text-gray-600 mt-1">{wo.project?.project_name}</div>
                              {wo.scheduled_start_time && (
                                <div className="flex items-center gap-1 text-gray-500 mt-1">
                                  <Clock className="w-3 h-3" />
                                  {wo.scheduled_start_time}
                                  {wo.estimated_duration && ` (${wo.estimated_duration}m)`}
                                </div>
                              )}
                              {wo.project?.contacts?.city && (
                                <div className="flex items-center gap-1 text-gray-500 mt-1">
                                  <MapPin className="w-3 h-3" />
                                  {wo.project.contacts.city}, {wo.project.contacts.state}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <CreateWorkOrderModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadScheduleData();
          }}
        />
      )}
    </div>
  );
}
