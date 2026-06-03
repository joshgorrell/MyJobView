import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Users,
  Calendar,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit2,
  Trash2,
  User,
  AlertCircle
} from 'lucide-react';

interface CrewMember {
  id: string;
  full_name: string;
  role: string;
}

interface Crew {
  id: string;
  name: string;
  lead_tech_id: string;
  lead_tech_name: string;
  members: CrewMember[];
  active: boolean;
}

interface CrewJob {
  id: string;
  work_order_number: string;
  crew_id: string;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  status: string;
  priority: string;
  project_name: string;
  customer_name: string;
  location: string;
  estimated_duration: number;
  required_techs: number;
}

export function CrewScheduleView() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [jobs, setJobs] = useState<CrewJob[]>([]);
  const [technicians, setTechnicians] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [showCrewManager, setShowCrewManager] = useState(false);
  const [editingCrew, setEditingCrew] = useState<Crew | null>(null);
  const [draggedJob, setDraggedJob] = useState<string | null>(null);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('crew-schedule')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_orders'
      }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [currentDate, viewMode]);

  async function loadData() {
    try {
      await Promise.all([
        loadCrews(),
        loadJobs(),
        loadTechnicians()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCrews() {
    const { data: crewData, error } = await supabase
      .from('work_order_groups')
      .select(`
        id,
        group_name,
        lead_tech_id,
        is_active,
        lead_tech:profiles!lead_tech_id (
          id,
          full_name
        ),
        members:work_order_group_members (
          technician:profiles (
            id,
            full_name,
            role
          )
        )
      `)
      .eq('is_active', true)
      .order('group_name');

    if (error) throw error;

    const crews: Crew[] = (crewData || []).map((c: any) => ({
      id: c.id,
      name: c.group_name,
      lead_tech_id: c.lead_tech_id,
      lead_tech_name: c.lead_tech?.full_name || 'Unknown',
      members: (c.members || []).map((m: any) => ({
        id: m.technician.id,
        full_name: m.technician.full_name,
        role: m.technician.role
      })),
      active: c.is_active
    }));

    setCrews(crews);
  }

  async function loadJobs() {
    const dateRange = getDateRange();

    const { data: workOrders, error } = await supabase
      .from('work_orders')
      .select(`
        id,
        work_order_number,
        work_order_group_id,
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        status,
        priority,
        estimated_duration,
        required_technicians,
        project:projects (
          project_name,
          contacts (
            full_name,
            company_name,
            city,
            state
          )
        )
      `)
      .not('work_order_group_id', 'is', null)
      .gte('scheduled_date', dateRange.start)
      .lte('scheduled_date', dateRange.end)
      .order('scheduled_date')
      .order('scheduled_start_time');

    if (error) throw error;

    const crewJobs: CrewJob[] = (workOrders || []).map((wo: any) => ({
      id: wo.id,
      work_order_number: wo.work_order_number,
      crew_id: wo.work_order_group_id,
      scheduled_date: wo.scheduled_date || '',
      scheduled_start_time: wo.scheduled_start_time || '',
      scheduled_end_time: wo.scheduled_end_time || '',
      status: wo.status,
      priority: wo.priority,
      project_name: wo.project?.project_name || 'Untitled',
      customer_name: wo.project?.contacts?.full_name || wo.project?.contacts?.company_name || 'Unknown',
      location: wo.project?.contacts?.city && wo.project?.contacts?.state
        ? `${wo.project.contacts.city}, ${wo.project.contacts.state}`
        : 'Unknown',
      estimated_duration: wo.estimated_duration || 60,
      required_techs: wo.required_technicians || 1
    }));

    setJobs(crewJobs);
  }

  async function loadTechnicians() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['tech', 'lead_tech'])
      .eq('is_active', true)
      .order('full_name');

    if (error) throw error;
    setTechnicians(data || []);
  }

  function getDateRange() {
    const start = new Date(currentDate);
    let end = new Date(currentDate);

    if (viewMode === 'week') {
      start.setDate(start.getDate() - start.getDay());
      end = new Date(start);
      end.setDate(end.getDate() + 6);
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  }

  function getDaysInView(): Date[] {
    const days: Date[] = [];
    const numDays = viewMode === 'week' ? 7 : 1;
    const start = viewMode === 'week' ? getWeekStart(currentDate) : currentDate;

    for (let i = 0; i < numDays; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      days.push(day);
    }

    return days;
  }

  function getWeekStart(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  function navigate(direction: 'prev' | 'next') {
    const newDate = new Date(currentDate);
    const offset = viewMode === 'week' ? 7 : 1;
    newDate.setDate(newDate.getDate() + (direction === 'next' ? offset : -offset));
    setCurrentDate(newDate);
  }

  function getJobsForCrewAndDate(crewId: string, date: Date) {
    const dateStr = date.toISOString().split('T')[0];
    return jobs.filter(j => j.crew_id === crewId && j.scheduled_date === dateStr);
  }

  async function handleDrop(crewId: string, date: Date) {
    if (!draggedJob) return;

    try {
      const { error } = await supabase
        .from('work_orders')
        .update({
          work_order_group_id: crewId,
          scheduled_date: date.toISOString().split('T')[0]
        })
        .eq('id', draggedJob);

      if (error) throw error;
      await loadJobs();
    } catch (error) {
      console.error('Error updating job:', error);
    } finally {
      setDraggedJob(null);
    }
  }

  function getPriorityColor(priority: string) {
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

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'bg-green-100 border-green-300';
      case 'in_progress':
        return 'bg-blue-100 border-blue-300';
      case 'assigned':
        return 'bg-yellow-100 border-yellow-300';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  }

  const days = getDaysInView();
  const unassignedCrewJobs = jobs.filter(j => !j.crew_id);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading crew schedule...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Crew Schedule</h2>
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
              onClick={() => setViewMode('day')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                viewMode === 'day'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Day
            </button>
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
          </div>
          <button
            onClick={() => setShowCrewManager(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Users className="w-4 h-4" />
            Manage Crews
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{crews.length}</div>
              <div className="text-sm text-gray-600">Active Crews</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{jobs.length}</div>
              <div className="text-sm text-gray-600">Crew Jobs</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{unassignedCrewJobs.length}</div>
              <div className="text-sm text-gray-600">Unassigned</div>
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
                <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-64 z-10">
                  Crew
                </th>
                {days.map(date => (
                  <th key={date.toISOString()} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[250px]">
                    <div className="flex flex-col">
                      <span>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      <span className="text-gray-900 text-sm font-bold">
                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Unassigned Row */}
              <tr className="hover:bg-gray-50">
                <td className="sticky left-0 bg-white px-4 py-3 border-r border-gray-200 z-10">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <Users className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="ml-3">
                      <div className="text-sm font-medium text-gray-900">Unassigned</div>
                      <div className="text-xs text-gray-500">{unassignedCrewJobs.length} jobs</div>
                    </div>
                  </div>
                </td>
                {days.map(date => {
                  const dateJobs = unassignedCrewJobs.filter(
                    j => j.scheduled_date === date.toISOString().split('T')[0]
                  );
                  return (
                    <td
                      key={date.toISOString()}
                      className="px-4 py-3 align-top"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop('', date)}
                    >
                      <div className="space-y-2">
                        {dateJobs.map(job => (
                          <div
                            key={job.id}
                            draggable
                            onDragStart={() => setDraggedJob(job.id)}
                            className={`p-2 rounded text-xs cursor-move hover:shadow-md ${getPriorityColor(job.priority)}`}
                          >
                            <div className="font-semibold text-gray-900">WO #{job.work_order_number}</div>
                            <div className="text-gray-600 mt-1">{job.project_name}</div>
                            <div className="flex items-center gap-1 text-gray-500 mt-1">
                              <Users className="w-3 h-3" />
                              Needs {job.required_techs} techs
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Crew Rows */}
              {crews.map(crew => (
                <tr key={crew.id} className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white px-4 py-3 border-r border-gray-200 z-10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">{crew.name}</div>
                          <div className="text-xs text-gray-500">
                            {crew.members.length} members • Lead: {crew.lead_tech_name}
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  {days.map(date => {
                    const dateJobs = getJobsForCrewAndDate(crew.id, date);
                    return (
                      <td
                        key={date.toISOString()}
                        className="px-4 py-3 align-top"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(crew.id, date)}
                      >
                        <div className="space-y-2">
                          {dateJobs.map(job => (
                            <div
                              key={job.id}
                              draggable
                              onDragStart={() => setDraggedJob(job.id)}
                              className={`p-2 rounded text-xs cursor-move hover:shadow-md border ${getStatusColor(job.status)} ${getPriorityColor(job.priority)}`}
                            >
                              <div className="font-semibold text-gray-900">WO #{job.work_order_number}</div>
                              <div className="text-gray-600 mt-1">{job.project_name}</div>
                              {job.scheduled_start_time && (
                                <div className="flex items-center gap-1 text-gray-500 mt-1">
                                  <Clock className="w-3 h-3" />
                                  {job.scheduled_start_time} ({job.estimated_duration}m)
                                </div>
                              )}
                              <div className="flex items-center gap-1 text-gray-500 mt-1">
                                <MapPin className="w-3 h-3" />
                                {job.location}
                              </div>
                              <div className="flex items-center gap-1 text-gray-500 mt-1">
                                <Users className="w-3 h-3" />
                                {job.required_techs} techs
                              </div>
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

      {/* Crew Manager Modal */}
      {showCrewManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Manage Crews</h2>
              <button
                onClick={() => setShowCrewManager(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              {crews.map(crew => (
                <div key={crew.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{crew.name}</h3>
                      <p className="text-sm text-gray-600">Lead: {crew.lead_tech_name}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="p-2 text-blue-600 hover:bg-blue-50 rounded">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {crew.members.map(member => (
                      <div
                        key={member.id}
                        className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-sm"
                      >
                        <User className="w-3 h-3 text-gray-500" />
                        {member.full_name}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600">
                <Plus className="w-5 h-5" />
                Create New Crew
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
