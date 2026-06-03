import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, Clock, User, MapPin, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { CreateAppointmentModal } from '../Appointments/CreateAppointmentModal';

interface Appointment {
  id: string;
  title: string;
  description: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  assigned_technician: string | null;
  location: string;
  contact?: {
    full_name: string;
    company_name: string;
  };
  project?: {
    name: string;
    project_number: string;
  };
}

interface Technician {
  id: string;
  full_name: string;
  role: string;
  status?: {
    status: string;
    notes: string;
  };
}

export function ScheduleBoard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draggedAppointment, setDraggedAppointment] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    loadScheduleData();

    const appointmentsChannel = supabase
      .channel('schedule-appointments')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments'
      }, () => {
        loadScheduleData();
      })
      .subscribe();

    return () => {
      appointmentsChannel.unsubscribe();
    };
  }, [currentDate, viewMode]);

  async function loadScheduleData() {
    try {
      const startDate = getWeekStart(currentDate);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + (viewMode === 'week' ? 7 : 1));

      const [appointmentsRes, techniciansRes] = await Promise.all([
        supabase
          .from('appointments')
          .select(`
            *,
            contact:contacts(full_name, company_name),
            project:projects(name, project_number)
          `)
          .gte('appointment_date', startDate.toISOString().split('T')[0])
          .lt('appointment_date', endDate.toISOString().split('T')[0])
          .order('start_time'),
        supabase
          .from('profiles')
          .select(`
            id,
            full_name,
            role,
            status:technician_status(status, notes)
          `)
          .in('role', ['tech'])
          .eq('is_active', true)
          .order('full_name')
      ]);

      if (appointmentsRes.data) setAppointments(appointmentsRes.data);
      if (techniciansRes.data) setTechnicians(techniciansRes.data);
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      setLoading(false);
    }
  }

  function getWeekStart(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  function getWeekDays() {
    const start = getWeekStart(currentDate);
    return Array.from({ length: viewMode === 'week' ? 7 : 1 }, (_, i) => {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      return date;
    });
  }

  function navigateWeek(direction: 'prev' | 'next') {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentDate(newDate);
  }

  function navigateDay(direction: 'prev' | 'next') {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  }

  async function handleDrop(technicianId: string, date: Date) {
    if (!draggedAppointment) return;

    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          assigned_technician: technicianId,
          appointment_date: date.toISOString().split('T')[0]
        })
        .eq('id', draggedAppointment);

      if (error) throw error;
      loadScheduleData();
    } catch (error) {
      console.error('Error updating appointment:', error);
    } finally {
      setDraggedAppointment(null);
    }
  }

  function getAppointmentsForTechAndDate(techId: string | null, date: Date) {
    const dateStr = date.toISOString().split('T')[0];
    return appointments.filter(
      apt => apt.assigned_technician === techId && apt.appointment_date === dateStr
    );
  }

  const timeSlots = Array.from({ length: 12 }, (_, i) => i + 7); // 7 AM to 6 PM

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Schedule Board</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => viewMode === 'week' ? navigateWeek('prev') : navigateDay('prev')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Today
            </button>
            <button
              onClick={() => viewMode === 'week' ? navigateWeek('next') : navigateDay('next')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('day')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'day'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'week'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Week
            </button>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Appointment
          </button>
        </div>
      </div>

      {/* Date Display */}
      <div className="flex items-center gap-2 text-lg font-medium text-gray-900">
        <Calendar className="w-5 h-5" />
        {viewMode === 'week' ? (
          <span>
            Week of {getWeekStart(currentDate).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </span>
        ) : (
          <span>
            {currentDate.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </span>
        )}
      </div>

      {/* Schedule Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-48">
                    Technician
                  </th>
                  {getWeekDays().map(date => (
                    <th key={date.toISOString()} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[200px]">
                      <div className="flex flex-col">
                        <span>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                        <span className="text-gray-900 text-sm">{date.getDate()}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Unassigned Row */}
                <tr className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-500" />
                      </div>
                      <span className="ml-3 text-sm font-medium text-gray-900">Unassigned</span>
                    </div>
                  </td>
                  {getWeekDays().map(date => {
                    const dateAppointments = getAppointmentsForTechAndDate(null, date);
                    return (
                      <td
                        key={date.toISOString()}
                        className="px-4 py-3 align-top"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop('', date)}
                      >
                        <div className="space-y-1">
                          {dateAppointments.map(apt => (
                            <div
                              key={apt.id}
                              draggable
                              onDragStart={() => setDraggedAppointment(apt.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAppointment(apt);
                              }}
                              className="p-2 bg-gray-100 border border-gray-300 rounded text-xs cursor-pointer hover:shadow-md"
                            >
                              <div className="font-medium text-gray-900">{apt.title}</div>
                              <div className="text-gray-600 flex items-center gap-1 mt-1">
                                <Clock className="w-3 h-3" />
                                {apt.start_time}
                              </div>
                              {apt.location && (
                                <div className="text-gray-600 flex items-center gap-1 mt-1">
                                  <MapPin className="w-3 h-3" />
                                  {apt.location}
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
                    <td className="sticky left-0 bg-white px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">{tech.full_name}</div>
                          {tech.status && (
                            <div className="text-xs text-gray-500">{tech.status.status}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    {getWeekDays().map(date => {
                      const dateAppointments = getAppointmentsForTechAndDate(tech.id, date);
                      return (
                        <td
                          key={date.toISOString()}
                          className="px-4 py-3 align-top"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDrop(tech.id, date)}
                        >
                          <div className="space-y-1">
                            {dateAppointments.map(apt => (
                              <div
                                key={apt.id}
                                draggable
                                onDragStart={() => setDraggedAppointment(apt.id)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAppointment(apt);
                                }}
                                className={`p-2 rounded text-xs cursor-pointer hover:shadow-md ${
                                  apt.status === 'completed'
                                    ? 'bg-green-100 border border-green-300'
                                    : apt.status === 'in_progress'
                                    ? 'bg-blue-100 border border-blue-300'
                                    : 'bg-yellow-100 border border-yellow-300'
                                }`}
                              >
                                <div className="font-medium text-gray-900">{apt.title}</div>
                                <div className="text-gray-600 flex items-center gap-1 mt-1">
                                  <Clock className="w-3 h-3" />
                                  {apt.start_time} - {apt.end_time}
                                </div>
                                {apt.location && (
                                  <div className="text-gray-600 flex items-center gap-1 mt-1">
                                    <MapPin className="w-3 h-3" />
                                    {apt.location.substring(0, 30)}...
                                  </div>
                                )}
                                {apt.project && (
                                  <div className="text-gray-600 text-xs mt-1">
                                    {apt.project.project_number}
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
      </div>

      {showCreateModal && (
        <CreateAppointmentModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadScheduleData();
          }}
        />
      )}

      {selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Appointment Details</h2>
              <button
                onClick={() => setSelectedAppointment(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{selectedAppointment.title}</h3>
                {selectedAppointment.description && (
                  <p className="text-gray-600 mt-2">{selectedAppointment.description}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Date</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-900">
                      {new Date(selectedAppointment.appointment_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">Time</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-900">
                      {selectedAppointment.start_time} - {selectedAppointment.end_time}
                    </span>
                  </div>
                </div>

                {selectedAppointment.location && (
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-gray-500">Location</label>
                    <div className="flex items-center gap-2 mt-1">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900">{selectedAppointment.location}</span>
                    </div>
                  </div>
                )}

                {selectedAppointment.contact && (
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-gray-500">Contact</label>
                    <div className="mt-1">
                      <p className="text-gray-900">{selectedAppointment.contact.full_name}</p>
                      {selectedAppointment.contact.company_name && (
                        <p className="text-gray-600 text-sm">{selectedAppointment.contact.company_name}</p>
                      )}
                    </div>
                  </div>
                )}

                {selectedAppointment.project && (
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-gray-500">Project</label>
                    <div className="mt-1">
                      <p className="text-gray-900">{selectedAppointment.project.name}</p>
                      <p className="text-gray-600 text-sm">{selectedAppointment.project.project_number}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div className="mt-1">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      selectedAppointment.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : selectedAppointment.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {selectedAppointment.status.replace('_', ' ').toUpperCase()}
                    </span>
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
