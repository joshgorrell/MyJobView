import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { User, Clock, MapPin, Phone, CheckCircle, XCircle, Coffee, AlertCircle } from 'lucide-react';

interface TechStatus {
  id: string;
  technician_id: string;
  status: string;
  current_appointment_id: string | null;
  notes: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  updated_at: string;
  technician: {
    full_name: string;
    email: string;
    role: string;
  };
  current_appointment?: {
    title: string;
    location: string;
    start_time: string;
    end_time: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    timestamp: string;
  };
}

export function TechStatusDashboard() {
  const [techStatuses, setTechStatuses] = useState<TechStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadTechStatuses();

    const channel = supabase
      .channel('tech-status-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_clock_entries'
      }, () => {
        loadTechStatuses();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'time_entries'
      }, () => {
        loadTechStatuses();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_clock_breaks'
      }, () => {
        loadTechStatuses();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  async function loadTechStatuses() {
    try {
      // Get all technician-related users
      const { data: allTechs, error: techError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['tech', 'manager']);

      if (techError) throw techError;

      const today = new Date().toISOString().split('T')[0];

      // Get today's clock entries for all techs with their clock-in location
      const { data: dailyClocks } = await supabase
        .from('daily_clock_entries')
        .select('id, technician_id, status, clock_in, clock_out, clock_in_latitude, clock_in_longitude')
        .eq('entry_date', today);

      // Get active breaks
      const { data: activeBreaks } = await supabase
        .from('daily_clock_breaks')
        .select('daily_clock_entry_id')
        .is('break_end', null);

      // Get active jobs
      const { data: activeJobs } = await supabase
        .from('time_entries')
        .select('technician_id, work_order:work_orders(id, title)')
        .is('clock_out', null);

      // Get latest location for each tech
      const techIds = allTechs?.map(t => t.id) || [];
      const { data: locations } = await supabase
        .from('gps_breadcrumbs')
        .select('technician_id, latitude, longitude, recorded_at')
        .in('technician_id', techIds)
        .gte('recorded_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order('recorded_at', { ascending: false });

      // Get latest location per tech
      const latestLocations = new Map();
      locations?.forEach(loc => {
        if (!latestLocations.has(loc.technician_id)) {
          latestLocations.set(loc.technician_id, loc);
        }
      });

      // Merge all data - create status for each tech
      const statusesWithLocation = allTechs?.map(tech => {
        const clock = dailyClocks?.find(c => c.technician_id === tech.id && !c.clock_out);
        const onJob = activeJobs?.find(j => j.technician_id === tech.id);
        const breakEntry = activeBreaks?.find(b => clock && b.daily_clock_entry_id === clock.id);
        const gpsLocation = latestLocations.get(tech.id);

        let status = 'off_duty';
        let clockInTime = null;

        if (clock?.status === 'clocked_in') {
          clockInTime = clock.clock_in;
          if (breakEntry) {
            status = 'break';
          } else if (onJob) {
            status = 'on_job';
          } else {
            status = 'available';
          }
        }

        // Use GPS breadcrumb if available, otherwise fall back to clock-in location
        let location = null;
        if (gpsLocation) {
          location = {
            latitude: gpsLocation.latitude,
            longitude: gpsLocation.longitude,
            timestamp: gpsLocation.recorded_at
          };
        } else if (clock?.clock_in_latitude && clock?.clock_in_longitude) {
          // Fall back to clock-in location if no recent GPS breadcrumbs
          location = {
            latitude: parseFloat(clock.clock_in_latitude),
            longitude: parseFloat(clock.clock_in_longitude),
            timestamp: clock.clock_in
          };
        }

        return {
          id: clock?.id || tech.id,
          technician_id: tech.id,
          status: status,
          current_appointment_id: null,
          notes: null,
          clock_in_time: clockInTime,
          clock_out_time: null,
          updated_at: new Date().toISOString(),
          technician: {
            full_name: tech.full_name,
            email: tech.email,
            role: tech.role
          },
          current_appointment: onJob?.work_order ? {
            title: onJob.work_order.title,
            location: '',
            start_time: '',
            end_time: ''
          } : undefined,
          location: location
        };
      });

      // Sort by status (available first, then on_job, etc.)
      const statusOrder = ['available', 'on_job', 'break', 'unavailable', 'off_duty'];
      statusesWithLocation?.sort((a, b) => {
        const aIndex = statusOrder.indexOf(a.status);
        const bIndex = statusOrder.indexOf(b.status);
        return aIndex - bIndex;
      });

      setTechStatuses(statusesWithLocation || []);
    } catch (error) {
      console.error('Error loading tech statuses:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateTechStatus(techId: string, newStatus: string, notes?: string) {
    try {
      const { error } = await supabase
        .from('technician_status')
        .upsert({
          technician_id: techId,
          status: newStatus,
          notes: notes || null,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      loadTechStatuses();
    } catch (error) {
      console.error('Error updating tech status:', error);
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'available':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'on_job':
        return <Clock className="w-5 h-5 text-blue-600" />;
      case 'break':
        return <Coffee className="w-5 h-5 text-yellow-600" />;
      case 'unavailable':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'off_duty':
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
      default:
        return <User className="w-5 h-5 text-gray-600" />;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'on_job':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'break':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'unavailable':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'off_duty':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  function getTimeWorked(clockInTime: string | null) {
    if (!clockInTime) return null;
    const start = new Date(clockInTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }

  const filteredStatuses = filter === 'all'
    ? techStatuses
    : techStatuses.filter(t => t.status === filter);

  const statusCounts = {
    all: techStatuses.length,
    available: techStatuses.filter(t => t.status === 'available').length,
    on_job: techStatuses.filter(t => t.status === 'on_job').length,
    break: techStatuses.filter(t => t.status === 'break').length,
    unavailable: techStatuses.filter(t => t.status === 'unavailable').length,
    off_duty: techStatuses.filter(t => t.status === 'off_duty').length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading technician statuses...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white">Technician Status</h2>
        <p className="text-gray-300">
          Real-time availability and status tracking
        </p>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
            filter === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All ({statusCounts.all})
        </button>
        <button
          onClick={() => setFilter('available')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
            filter === 'available'
              ? 'bg-green-600 text-white'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
        >
          Available ({statusCounts.available})
        </button>
        <button
          onClick={() => setFilter('on_job')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
            filter === 'on_job'
              ? 'bg-blue-600 text-white'
              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          }`}
        >
          On Job ({statusCounts.on_job})
        </button>
        <button
          onClick={() => setFilter('break')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
            filter === 'break'
              ? 'bg-yellow-600 text-white'
              : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
          }`}
        >
          On Break ({statusCounts.break})
        </button>
        <button
          onClick={() => setFilter('unavailable')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
            filter === 'unavailable'
              ? 'bg-red-600 text-white'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          Unavailable ({statusCounts.unavailable})
        </button>
        <button
          onClick={() => setFilter('off_duty')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
            filter === 'off_duty'
              ? 'bg-gray-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Off Duty ({statusCounts.off_duty})
        </button>
      </div>

      {/* Technicians Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStatuses.map(tech => (
          <div key={tech.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{tech.technician.full_name}</div>
                  <div className="text-sm text-gray-500">{tech.technician.role}</div>
                </div>
              </div>
              {getStatusIcon(tech.status)}
            </div>

            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${
              getStatusColor(tech.status)
            }`}>
              {tech.status.replace('_', ' ').toUpperCase()}
            </div>

            {tech.clock_in_time && tech.status !== 'off_duty' && (
              <div className="mt-3 text-sm text-gray-600">
                <span className="font-medium">Time worked:</span> {getTimeWorked(tech.clock_in_time)}
              </div>
            )}

            {tech.current_appointment && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <div className="text-sm font-medium text-gray-900 mb-1">
                  Current Job
                </div>
                <div className="text-sm text-gray-700">{tech.current_appointment.title}</div>
                {tech.current_appointment.location && (
                  <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
                    <MapPin className="w-3 h-3" />
                    {tech.current_appointment.location.substring(0, 40)}...
                  </div>
                )}
                <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
                  <Clock className="w-3 h-3" />
                  {tech.current_appointment.start_time} - {tech.current_appointment.end_time}
                </div>
              </div>
            )}

            {tech.notes && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 italic">
                "{tech.notes}"
              </div>
            )}

            {tech.location && (
              <div className="mt-3 text-xs text-gray-500">
                Last location update: {new Date(tech.location.timestamp).toLocaleTimeString()}
              </div>
            )}
          </div>
        ))}

        {filteredStatuses.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500">
            No technicians with {filter} status
          </div>
        )}
      </div>
    </div>
  );
}
