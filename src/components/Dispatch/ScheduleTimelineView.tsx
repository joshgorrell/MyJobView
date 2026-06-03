import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  User,
  Clock,
  MapPin,
  AlertCircle
} from 'lucide-react';

interface TimelineJob {
  id: string;
  work_order_number: string;
  assigned_to: string;
  technician_name: string;
  start_date: string;
  end_date: string;
  status: string;
  priority: string;
  project_name: string;
  customer_name: string;
  location: string;
  estimated_hours: number;
}

interface Technician {
  id: string;
  full_name: string;
}

type ZoomLevel = 'day' | 'week' | 'month';

export function ScheduleTimelineView() {
  const [jobs, setJobs] = useState<TimelineJob[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week');
  const [selectedJob, setSelectedJob] = useState<TimelineJob | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTimelineData();
  }, [currentDate, zoomLevel]);

  async function loadTimelineData() {
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
            target_completion_date,
            status,
            priority,
            estimated_duration,
            project:projects (
              project_name,
              contacts (
                full_name,
                company_name,
                city,
                state
              )
            ),
            technician:profiles!assigned_to (
              id,
              full_name
            )
          `)
          .gte('scheduled_date', dateRange.start)
          .lte('target_completion_date', dateRange.end)
          .not('assigned_to', 'is', null)
          .order('scheduled_date'),
        supabase
          .from('profiles')
          .select('id, full_name')
          .in('role', ['tech', 'lead_tech'])
          .eq('is_active', true)
          .order('full_name')
      ]);

      if (workOrdersRes.error) throw workOrdersRes.error;
      if (techniciansRes.error) throw techniciansRes.error;

      const timelineJobs: TimelineJob[] = (workOrdersRes.data || [])
        .filter((wo: any) => wo.scheduled_date && wo.target_completion_date)
        .map((wo: any) => ({
          id: wo.id,
          work_order_number: wo.work_order_number,
          assigned_to: wo.assigned_to,
          technician_name: wo.technician?.full_name || 'Unknown',
          start_date: wo.scheduled_date,
          end_date: wo.target_completion_date,
          status: wo.status,
          priority: wo.priority,
          project_name: wo.project?.project_name || 'Untitled',
          customer_name: wo.project?.contacts?.full_name || wo.project?.contacts?.company_name || 'Unknown',
          location: wo.project?.contacts?.city && wo.project?.contacts?.state
            ? `${wo.project.contacts.city}, ${wo.project.contacts.state}`
            : 'Unknown',
          estimated_hours: Math.round((wo.estimated_duration || 60) / 60 * 10) / 10
        }));

      setJobs(timelineJobs);
      setTechnicians(techniciansRes.data || []);
    } catch (error) {
      console.error('Error loading timeline data:', error);
    } finally {
      setLoading(false);
    }
  }

  function getDateRange() {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    switch (zoomLevel) {
      case 'day':
        end.setDate(end.getDate() + 6);
        break;
      case 'week':
        start.setDate(start.getDate() - start.getDay());
        end.setDate(start.getDate() + 27);
        break;
      case 'month':
        start.setDate(1);
        end.setMonth(end.getMonth() + 2);
        end.setDate(0);
        break;
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  }

  function getTimelineDays(): Date[] {
    const days: Date[] = [];
    const dateRange = getDateRange();
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }

    return days;
  }

  function navigate(direction: 'prev' | 'next') {
    const newDate = new Date(currentDate);
    let offset = 7;

    switch (zoomLevel) {
      case 'day':
        offset = 7;
        break;
      case 'week':
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
    }

    newDate.setDate(newDate.getDate() + (direction === 'next' ? offset : -offset));
    setCurrentDate(newDate);
  }

  function getJobPosition(job: TimelineJob, days: Date[]) {
    const startDate = new Date(job.start_date);
    const endDate = new Date(job.end_date);
    const firstDay = days[0];
    const lastDay = days[days.length - 1];

    const startIndex = days.findIndex(d => d.toDateString() === startDate.toDateString());
    const endIndex = days.findIndex(d => d.toDateString() === endDate.toDateString());

    if (startIndex === -1 || endIndex === -1) return null;

    const spanDays = endIndex - startIndex + 1;
    const left = (startIndex / days.length) * 100;
    const width = (spanDays / days.length) * 100;

    return { left, width, spanDays };
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'bg-green-500 border-green-600';
      case 'in_progress':
        return 'bg-blue-500 border-blue-600';
      case 'assigned':
        return 'bg-yellow-500 border-yellow-600';
      case 'on_hold':
        return 'bg-gray-400 border-gray-500';
      default:
        return 'bg-gray-300 border-gray-400';
    }
  }

  function getPriorityIndicator(priority: string) {
    switch (priority?.toLowerCase()) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      default:
        return '⚪';
    }
  }

  function getDayWidth() {
    switch (zoomLevel) {
      case 'day':
        return 120;
      case 'week':
        return 40;
      case 'month':
        return 20;
    }
  }

  const days = getTimelineDays();
  const dayWidth = getDayWidth();
  const totalWidth = days.length * dayWidth;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading timeline...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Timeline View (Gantt)</h2>
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
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white rounded-lg p-1">
            <button
              onClick={() => setZoomLevel('day')}
              className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                zoomLevel === 'day'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Days
            </button>
            <button
              onClick={() => setZoomLevel('week')}
              className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                zoomLevel === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Weeks
            </button>
            <button
              onClick={() => setZoomLevel('month')}
              className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                zoomLevel === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Months
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{technicians.length}</div>
          <div className="text-sm text-gray-600">Technicians</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{jobs.length}</div>
          <div className="text-sm text-gray-600">Active Jobs</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">
            {jobs.filter(j => new Date(j.end_date) < new Date()).length}
          </div>
          <div className="text-sm text-gray-600">Past Due</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">
            {jobs.reduce((sum, j) => sum + j.estimated_hours, 0).toFixed(1)}h
          </div>
          <div className="text-sm text-gray-600">Total Hours</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {/* Technician Names Column */}
          <div className="w-48 flex-shrink-0 bg-gray-50 border-r border-gray-200">
            <div className="h-12 flex items-center px-4 border-b border-gray-200 font-medium text-sm text-gray-700">
              Technician
            </div>
            {technicians.map(tech => (
              <div
                key={tech.id}
                className="h-16 flex items-center px-4 border-b border-gray-200 hover:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">{tech.full_name}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Timeline Grid */}
          <div className="flex-1 overflow-x-auto" ref={scrollRef}>
            <div style={{ minWidth: `${totalWidth}px` }}>
              {/* Date Headers */}
              <div className="h-12 flex border-b border-gray-200 bg-gray-50">
                {days.map((day, idx) => {
                  const isToday = day.toDateString() === new Date().toDateString();
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                  return (
                    <div
                      key={idx}
                      className={`flex-shrink-0 border-r border-gray-200 flex flex-col items-center justify-center text-xs ${
                        isToday ? 'bg-blue-100 font-bold' : ''
                      } ${isWeekend ? 'bg-gray-100' : ''}`}
                      style={{ width: `${dayWidth}px` }}
                    >
                      {zoomLevel === 'day' && (
                        <>
                          <span className="text-gray-500">{day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                          <span className="font-medium">{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </>
                      )}
                      {zoomLevel === 'week' && (
                        <span className="font-medium">{day.getDate()}</span>
                      )}
                      {zoomLevel === 'month' && day.getDate() === 1 && (
                        <span className="font-medium">{day.toLocaleDateString('en-US', { month: 'short' })}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Job Rows */}
              {technicians.map(tech => {
                const techJobs = jobs.filter(j => j.assigned_to === tech.id);

                return (
                  <div key={tech.id} className="h-16 relative border-b border-gray-200">
                    {/* Grid Background */}
                    <div className="absolute inset-0 flex">
                      {days.map((day, idx) => {
                        const isToday = day.toDateString() === new Date().toDateString();
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                        return (
                          <div
                            key={idx}
                            className={`flex-shrink-0 border-r border-gray-100 ${
                              isToday ? 'bg-blue-50' : isWeekend ? 'bg-gray-50' : ''
                            }`}
                            style={{ width: `${dayWidth}px` }}
                          />
                        );
                      })}
                    </div>

                    {/* Job Bars */}
                    {techJobs.map(job => {
                      const position = getJobPosition(job, days);
                      if (!position) return null;

                      return (
                        <div
                          key={job.id}
                          className={`absolute h-10 rounded border-2 cursor-pointer transition-all hover:shadow-lg hover:z-10 ${getStatusColor(job.status)}`}
                          style={{
                            left: `${position.left}%`,
                            width: `${position.width}%`,
                            top: '12px'
                          }}
                          onClick={() => setSelectedJob(job)}
                        >
                          <div className="px-2 py-1 text-white text-xs font-medium truncate">
                            {getPriorityIndicator(job.priority)} {job.work_order_number} - {job.project_name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 border-2 border-yellow-600 rounded"></div>
            <span className="text-gray-700">Assigned</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 border-2 border-blue-600 rounded"></div>
            <span className="text-gray-700">In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 border-2 border-green-600 rounded"></div>
            <span className="text-gray-700">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-400 border-2 border-gray-500 rounded"></div>
            <span className="text-gray-700">On Hold</span>
          </div>
        </div>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Job Details</h3>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Work Order</label>
                  <div className="text-gray-900 font-semibold">#{selectedJob.work_order_number}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div className={`inline-block px-2 py-1 rounded text-xs font-medium text-white ${getStatusColor(selectedJob.status)}`}>
                    {selectedJob.status}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Technician</label>
                  <div className="text-gray-900">{selectedJob.technician_name}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Priority</label>
                  <div className="text-gray-900">{getPriorityIndicator(selectedJob.priority)} {selectedJob.priority}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Start Date</label>
                  <div className="text-gray-900">
                    {new Date(selectedJob.start_date).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">End Date</label>
                  <div className="text-gray-900">
                    {new Date(selectedJob.end_date).toLocaleDateString()}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-500">Project</label>
                  <div className="text-gray-900 font-medium">{selectedJob.project_name}</div>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-500">Customer</label>
                  <div className="text-gray-900">{selectedJob.customer_name}</div>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-500">Location</label>
                  <div className="text-gray-900 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    {selectedJob.location}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Estimated Hours</label>
                  <div className="text-gray-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    {selectedJob.estimated_hours}h
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
