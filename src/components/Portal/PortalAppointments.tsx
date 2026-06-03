import { useState, useEffect } from 'react';
import { Calendar, Clock, User, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Appointment {
  id: string;
  title: string;
  description: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  location: string;
  technician_name: string;
  project_id: string;
}

export default function PortalAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    loadAppointments();
  }, [filter]);

  async function loadAppointments() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('contact_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.contact_id) return;

      const today = new Date().toISOString().split('T')[0];
      let query = supabase
        .from('appointments')
        .select(`
          id,
          title,
          description,
          appointment_date,
          start_time,
          end_time,
          status,
          location,
          project_id,
          technician:technician_id (
            full_name
          ),
          projects:project_id (
            contact_id
          )
        `)
        .eq('projects.contact_id', profile.contact_id);

      if (filter === 'upcoming') {
        query = query.gte('appointment_date', today);
      } else {
        query = query.lt('appointment_date', today);
      }

      const { data, error } = await query
        .order('appointment_date', { ascending: filter === 'upcoming' })
        .order('start_time', { ascending: true });

      if (error) throw error;

      const formattedAppointments = (data || []).map((apt: any) => ({
        ...apt,
        technician_name: apt.technician?.full_name || 'TBD',
      }));

      setAppointments(formattedAppointments);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading appointments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">My Appointments</h1>
        <p className="text-gray-500 text-sm">View your scheduled appointments and technician visits</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setFilter('upcoming')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              filter === 'upcoming'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setFilter('past')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              filter === 'past'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Past
          </button>
        </div>
      </div>

      {appointments.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No {filter} appointments
          </h3>
          <p className="text-gray-500">
            {filter === 'upcoming'
              ? "You don't have any scheduled appointments."
              : "You don't have any past appointments."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map((appointment) => (
            <AppointmentCard key={appointment.id} appointment={appointment} />
          ))}
        </div>
      )}
    </div>
  );
}

function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const appointmentDate = new Date(appointment.appointment_date);
  const isToday = appointmentDate.toDateString() === new Date().toDateString();
  const isTomorrow = appointmentDate.toDateString() === new Date(Date.now() + 86400000).toDateString();

  let dateLabel = appointmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  if (isToday) dateLabel = `Today, ${dateLabel}`;
  if (isTomorrow) dateLabel = `Tomorrow, ${dateLabel}`;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {appointment.title}
          </h3>
          {appointment.description && (
            <p className="text-sm text-gray-600">{appointment.description}</p>
          )}
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-start gap-3">
          <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">Date</p>
            <p className="text-sm text-gray-600">{dateLabel}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">Time</p>
            <p className="text-sm text-gray-600">
              {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <User className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">Technician</p>
            <p className="text-sm text-gray-600">{appointment.technician_name}</p>
          </div>
        </div>

        {appointment.location && (
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">Location</p>
              <p className="text-sm text-gray-600">{appointment.location}</p>
            </div>
          </div>
        )}
      </div>

      {isToday && appointment.status === 'scheduled' && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Reminder:</strong> Your appointment is today!
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs = {
    scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700' },
    in_progress: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-700' },
    completed: { label: 'Completed', className: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700' },
  };

  const config = configs[status as keyof typeof configs] || configs.scheduled;

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}
