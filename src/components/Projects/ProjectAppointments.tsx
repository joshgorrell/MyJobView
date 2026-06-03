import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, Clock, User, MapPin, Plus } from 'lucide-react';

interface ProjectAppointmentsProps {
  projectId: string;
}

export default function ProjectAppointments({ projectId }: ProjectAppointmentsProps) {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAppointments();
  }, [projectId]);

  async function loadAppointments() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          profiles!appointments_assigned_technician_fkey(full_name, email)
        `)
        .eq('project_id', projectId)
        .order('appointment_date', { ascending: true });

      if (error) throw error;

      setAppointments(data || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading appointments...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Appointments</h2>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            <Plus size={18} />
            Schedule Appointment
          </button>
        </div>

        {appointments.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            No appointments scheduled yet
          </div>
        ) : (
          <div className="space-y-3">
            {appointments.map((appointment) => (
              <div
                key={appointment.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-2">
                      {appointment.title}
                    </h3>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-300">
                        <Calendar size={16} className="text-gray-400" />
                        <span>
                          {new Date(appointment.appointment_date).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-gray-300">
                        <Clock size={16} className="text-gray-400" />
                        <span>
                          {appointment.start_time} - {appointment.end_time}
                        </span>
                      </div>

                      {appointment.profiles && (
                        <div className="flex items-center gap-2 text-gray-300">
                          <User size={16} className="text-gray-400" />
                          <span>{appointment.profiles.full_name}</span>
                        </div>
                      )}

                      {appointment.location && (
                        <div className="flex items-center gap-2 text-gray-300">
                          <MapPin size={16} className="text-gray-400" />
                          <span>{appointment.location}</span>
                        </div>
                      )}
                    </div>

                    {appointment.description && (
                      <p className="text-sm text-gray-400 mt-3">
                        {appointment.description}
                      </p>
                    )}
                  </div>

                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      appointment.status === 'completed'
                        ? 'bg-green-500/20 text-green-400'
                        : appointment.status === 'in_progress'
                        ? 'bg-blue-500/20 text-blue-400'
                        : appointment.status === 'cancelled'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {appointment.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
