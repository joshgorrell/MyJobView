import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Calendar,
  User,
  Clock,
  Briefcase,
  Heart,
  Coffee,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter
} from 'lucide-react';

interface TimeOffRequest {
  id: string;
  user_id: string;
  user_name: string;
  start_date: string;
  end_date: string;
  pto_type: string;
  status: string;
  reason: string;
  hours: number;
}

interface TechStatus {
  user_id: string;
  user_name: string;
  status: string;
  role: string;
  employment_type: string;
}

interface DayAvailability {
  date: string;
  available: number;
  pto: number;
  sick: number;
  blocked: number;
  total: number;
}

interface ResourceAvailabilityCalendarProps {
  viewType?: 'all-technicians' | 'my-calendar' | 'all-users';
  userId?: string;
}

export function ResourceAvailabilityCalendar({ viewType = 'all-technicians', userId }: ResourceAvailabilityCalendarProps) {
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [technicians, setTechnicians] = useState<TechStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [showLegend, setShowLegend] = useState(true);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('resource-availability')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pto_requests'
      }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [currentDate, viewMode, viewType, userId]);

  async function loadData() {
    try {
      await Promise.all([
        loadTimeOffRequests(),
        loadTechnicians()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeOffRequests() {
    const dateRange = getDateRange();

    const { data, error } = await supabase
      .from('pto_requests')
      .select(`
        id,
        user_id,
        start_date,
        end_date,
        pto_type,
        status,
        reason,
        hours_requested,
        user:profiles!user_id (
          full_name
        )
      `)
      .gte('end_date', dateRange.start)
      .lte('start_date', dateRange.end)
      .order('start_date');

    if (error) throw error;

    const requests: TimeOffRequest[] = (data || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      user_name: r.user?.full_name || 'Unknown',
      start_date: r.start_date,
      end_date: r.end_date,
      pto_type: r.pto_type,
      status: r.status,
      reason: r.reason || '',
      hours: r.hours_requested || 0
    }));

    setTimeOffRequests(requests);
  }

  async function loadTechnicians() {
    let query = supabase
      .from('profiles')
      .select('id, full_name, role, employment_type')
      .eq('is_active', true);

    if (viewType === 'my-calendar' && userId) {
      query = query.eq('id', userId);
    } else if (viewType === 'all-technicians') {
      query = query.eq('role', 'tech');
    }

    query = query.order('full_name');

    const { data, error } = await query;

    if (error) {
      console.error('Error loading users:', error);
      throw error;
    }

    const techs: TechStatus[] = (data || []).map((t: any) => ({
      user_id: t.id,
      user_name: t.full_name,
      status: 'available',
      role: t.role,
      employment_type: t.employment_type
    }));

    setTechnicians(techs);
  }

  function getDateRange() {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (viewMode === 'month') {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
    } else {
      start.setDate(start.getDate() - start.getDay());
      end.setDate(start.getDate() + 6);
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  }

  function getDaysInView(): Date[] {
    const days: Date[] = [];

    if (viewMode === 'month') {
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const startDay = new Date(firstDay);
      startDay.setDate(startDay.getDate() - startDay.getDay());

      const endDay = new Date(lastDay);
      endDay.setDate(endDay.getDate() + (6 - endDay.getDay()));

      for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d));
      }
    } else {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());

      for (let i = 0; i < 7; i++) {
        const day = new Date(start);
        day.setDate(day.getDate() + i);
        days.push(day);
      }
    }

    return days;
  }

  function navigate(direction: 'prev' | 'next') {
    const newDate = new Date(currentDate);

    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    }

    setCurrentDate(newDate);
  }

  function getTimeOffForDate(userId: string, date: Date): TimeOffRequest | null {
    const dateStr = date.toISOString().split('T')[0];
    return timeOffRequests.find(
      r => r.user_id === userId &&
           r.start_date <= dateStr &&
           r.end_date >= dateStr
    ) || null;
  }

  function getDayAvailability(date: Date): DayAvailability {
    const dateStr = date.toISOString().split('T')[0];
    let available = 0;
    let pto = 0;
    let sick = 0;
    let blocked = 0;

    technicians.forEach(tech => {
      const timeOff = getTimeOffForDate(tech.user_id, date);

      if (!timeOff || timeOff.status === 'rejected') {
        available++;
      } else if (timeOff.status === 'approved') {
        if (timeOff.pto_type === 'sick') {
          sick++;
        } else {
          pto++;
        }
      } else {
        blocked++;
      }
    });

    return {
      date: dateStr,
      available,
      pto,
      sick,
      blocked,
      total: technicians.length
    };
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case 'vacation':
        return <Briefcase className="w-3 h-3" />;
      case 'sick':
        return <Heart className="w-3 h-3" />;
      case 'personal':
        return <Coffee className="w-3 h-3" />;
      default:
        return <Clock className="w-3 h-3" />;
    }
  }

  function getTypeColor(type: string) {
    switch (type) {
      case 'vacation':
        return 'bg-blue-100 text-blue-800';
      case 'sick':
        return 'bg-red-100 text-red-800';
      case 'personal':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  async function handleStatusChange(requestId: string, newStatus: 'approved' | 'rejected') {
    try {
      const { error } = await supabase
        .from('pto_requests')
        .update({ status: newStatus })
        .eq('id', requestId);

      if (error) throw error;
      await loadTimeOffRequests();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update request');
    }
  }

  const days = getDaysInView();
  const filteredRequests = timeOffRequests.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterType !== 'all' && r.pto_type !== filterType) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading availability calendar...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            {viewType === 'my-calendar' ? 'My Calendar' : viewType === 'all-technicians' ? 'Technician Calendar' : 'Resource Availability'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('prev')}
              className="p-2 bg-white hover:bg-gray-100 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 text-sm font-medium bg-white hover:bg-gray-100 rounded-lg"
            >
              Today
            </button>
            <button
              onClick={() => navigate('next')}
              className="p-2 bg-white hover:bg-gray-100 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <span className="text-lg font-medium text-white">
            {viewMode === 'month'
              ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              : `Week of ${getDaysInView()[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            }
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white rounded-lg p-1">
            <button
              onClick={() => setViewMode('week')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                viewMode === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                viewMode === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{technicians.length}</div>
              <div className="text-sm text-gray-600">
                {viewType === 'my-calendar' ? 'Me' : viewType === 'all-technicians' ? 'Total Techs' : 'Total Users'}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {timeOffRequests.filter(r => r.status === 'pending').length}
              </div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {timeOffRequests.filter(r => r.status === 'approved').length}
              </div>
              <div className="text-sm text-gray-600">Approved</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {(() => {
                  const today = new Date();
                  const availability = getDayAvailability(today);
                  return availability.pto + availability.sick;
                })()}
              </div>
              <div className="text-sm text-gray-600">Out Today</div>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {viewMode === 'month' ? (
          <div className="p-4">
            {/* Month View */}
            <div className="grid grid-cols-7 gap-2">
              {/* Day Headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                  {day}
                </div>
              ))}

              {/* Calendar Days */}
              {days.map((date, idx) => {
                const availability = getDayAvailability(date);
                const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                const isToday = date.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={idx}
                    className={`min-h-24 border rounded-lg p-2 ${
                      isToday ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    } ${!isCurrentMonth ? 'bg-gray-50 opacity-50' : ''}`}
                  >
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      {date.getDate()}
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          {availability.available}
                        </span>
                      </div>
                      {availability.pto > 0 && (
                        <div className="text-blue-600 flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          {availability.pto} PTO
                        </div>
                      )}
                      {availability.sick > 0 && (
                        <div className="text-red-600 flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          {availability.sick} Sick
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Week View - Technician Grid */}
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-48">
                    Technician
                  </th>
                  {days.map(date => {
                    const isToday = date.toDateString() === new Date().toDateString();
                    return (
                      <th
                        key={date.toISOString()}
                        className={`px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase min-w-[120px] ${
                          isToday ? 'bg-blue-100' : ''
                        }`}
                      >
                        <div className="flex flex-col">
                          <span>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                          <span className="text-gray-900 font-bold">{date.getDate()}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {technicians.map(tech => (
                  <tr key={tech.user_id} className="hover:bg-gray-50">
                    <td className="sticky left-0 bg-white px-4 py-3 whitespace-nowrap border-r border-gray-200">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">{tech.user_name}</div>
                          <div className="text-xs text-gray-500">{tech.role}</div>
                        </div>
                      </div>
                    </td>
                    {days.map(date => {
                      const timeOff = getTimeOffForDate(tech.user_id, date);
                      const isToday = date.toDateString() === new Date().toDateString();

                      return (
                        <td
                          key={date.toISOString()}
                          className={`px-2 py-3 text-center ${isToday ? 'bg-blue-50' : ''}`}
                        >
                          {timeOff ? (
                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getTypeColor(timeOff.pto_type)}`}>
                              {getTypeIcon(timeOff.pto_type)}
                              {timeOff.pto_type}
                            </div>
                          ) : (
                            <div className="text-green-600 flex items-center justify-center">
                              <CheckCircle className="w-5 h-5" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Time Off Requests List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Time Off Requests</h3>
          <div className="flex gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Types</option>
              <option value="vacation">Vacation</option>
              <option value="sick">Sick</option>
              <option value="personal">Personal</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {filteredRequests.map(request => (
            <div key={request.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="font-medium text-gray-900">{request.user_name}</div>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getTypeColor(request.pto_type)}`}>
                      {getTypeIcon(request.pto_type)}
                      {request.pto_type}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(request.status)}`}>
                      {request.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {request.hours} hours
                    </div>
                  </div>
                  {request.reason && (
                    <div className="mt-2 text-sm text-gray-600">
                      {request.reason}
                    </div>
                  )}
                </div>

                {request.status === 'pending' && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleStatusChange(request.id, 'approved')}
                      className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatusChange(request.id, 'rejected')}
                      className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {filteredRequests.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No time off requests found
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Legend</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-gray-700">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600" />
              <span className="text-gray-700">Vacation/PTO</span>
            </div>
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-600" />
              <span className="text-gray-700">Sick Leave</span>
            </div>
            <div className="flex items-center gap-2">
              <Coffee className="w-4 h-4 text-purple-600" />
              <span className="text-gray-700">Personal Day</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
