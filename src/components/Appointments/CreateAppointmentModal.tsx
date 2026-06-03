import { useState, useEffect } from 'react';
import { X, Save, Calendar, User, Lock, Unlock, Clock, Wrench, BookOpen } from 'lucide-react';
import { ContactSearchSelect } from '../Shared/ContactSearchSelect';
import { RecurrenceSelector, RecurrenceRule } from '../Shared/RecurrenceSelector';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface Project {
  id: string;
  project_number: string;
  project_name: string;
}

interface Technician {
  id: string;
  full_name: string;
  email: string;
}

interface CreateAppointmentModalProps {
  projectId?: string;
  contactId?: string;
  calendarContext?: 'my' | 'technicians'; // New prop to distinguish calendar mode
  initialDate?: string; // Pre-fill date from calendar click
  initialTime?: string; // Pre-fill start time from calendar click
  initialEndTime?: string; // Pre-fill end time from drag selection
  onClose: () => void;
  onSuccess: () => void;
}

type AppointmentType = 'customer_meeting' | 'personal' | 'work_order' | 'shop_time' | 'training' | 'other';

export function CreateAppointmentModal({
  projectId,
  contactId,
  calendarContext = 'technicians',
  initialDate,
  initialTime,
  initialEndTime,
  onClose,
  onSuccess
}: CreateAppointmentModalProps) {
  const { user, profile } = useAuth();

  // Default to personal for My Calendar, customer_meeting for Technician Calendar
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(
    calendarContext === 'my' ? 'personal' : 'customer_meeting'
  );
  const [selectedContactId, setSelectedContactId] = useState(contactId || '');
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [appointmentDate, setAppointmentDate] = useState(initialDate || '');
  const [startTime, setStartTime] = useState(initialTime || '');
  const [endTime, setEndTime] = useState(initialEndTime || '');
  const [allDay, setAllDay] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [technicianId, setTechnicianId] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedContactId) {
      loadProjectsForContact(selectedContactId);
    } else {
      setProjects([]);
      setSelectedProjectId('');
    }
  }, [selectedContactId]);

  // Auto-set technician for personal appointments or My Calendar
  useEffect(() => {
    if ((appointmentType === 'personal' || calendarContext === 'my') && user) {
      setTechnicianId(user.id);
    }
  }, [appointmentType, user, calendarContext]);

  // Auto-calculate end time (1 hour after start time) snapped to 30-min increment
  useEffect(() => {
    if (startTime && !endTime && !initialEndTime) {
      const [hours, minutes] = startTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + 60;
      const snapped = Math.round(totalMinutes / 30) * 30;
      const endHour = Math.floor(snapped / 60) % 24;
      const endMin = snapped % 60;
      setEndTime(`${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`);
    }
  }, [startTime]);

  function generateTimeOptions(): { value: string; label: string }[] {
    const options: { value: string; label: string }[] = [];
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        const period = h < 12 ? 'AM' : 'PM';
        const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const displayMin = m === 0 ? '00' : '30';
        options.push({ value, label: `${displayHour}:${displayMin} ${period}` });
      }
    }
    return options;
  }

  const timeOptions = generateTimeOptions();

  // Update title placeholder based on context and type
  const getTitlePlaceholder = () => {
    if (calendarContext === 'my') {
      return 'e.g., Meeting with client, Lunch, Personal appointment';
    }
    switch (appointmentType) {
      case 'customer_meeting':
        return 'e.g., Consultation, Site Visit, Follow-up';
      case 'personal':
        return 'e.g., Doctor Appointment, Lunch Break, Personal Time';
      case 'work_order':
        return 'e.g., Installation, Service Call, Inspection';
      default:
        return 'e.g., Meeting, Event';
    }
  };

  async function loadData() {
    setLoading(true);
    try {
      const [contactsRes, techniciansRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, first_name, last_name, email')
          .order('first_name'),
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('role', ['admin', 'sales', 'technician', 'service_manager'])
          .eq('is_active', true)
          .order('full_name'),
      ]);

      if (contactsRes.error) throw contactsRes.error;
      if (techniciansRes.error) throw techniciansRes.error;

      setContacts(contactsRes.data || []);
      setTechnicians(techniciansRes.data || []);

      if (contactId) {
        await loadProjectsForContact(contactId);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function loadProjectsForContact(contactId: string) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_number, project_name')
        .eq('customer_id', contactId)
        .in('status', ['planning', 'active'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate customer for customer meetings (only in Technician Calendar mode)
    if (calendarContext === 'technicians' && appointmentType === 'customer_meeting' && !selectedContactId) {
      alert('Please select a customer for customer meetings');
      return;
    }

    // Validate date
    if (!appointmentDate) {
      alert('Please select an appointment date');
      return;
    }

    // Validate times for non-all-day events
    if (!allDay && (!startTime || !endTime)) {
      alert('Please fill in start and end times, or mark as all-day event');
      return;
    }

    // Validate technician for non-personal appointments (only in Technician Calendar mode)
    if (calendarContext === 'technicians' && appointmentType !== 'personal' && !technicianId) {
      alert('Please select a technician');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const isRecurring = recurrenceRule !== null;

      const { data: created, error } = await supabase
        .from('appointments')
        .insert({
          appointment_type: appointmentType,
          contact_id: selectedContactId || null,
          project_id: selectedProjectId || null,
          appointment_date: appointmentDate,
          start_time: allDay ? null : startTime,
          end_time: allDay ? null : endTime,
          all_day: allDay,
          is_private: isPrivate,
          assigned_technician: technicianId || null,
          title: title || (appointmentType === 'personal' ? 'Personal Event' : 'Appointment'),
          location: location || null,
          notes: notes || null,
          status: 'scheduled',
          created_by: user.id,
          company_id: user.id,
          is_recurring_parent: isRecurring,
          recurrence_rule: isRecurring ? recurrenceRule : null,
        })
        .select('id');

      if (error) throw error;

      if (isRecurring && created && created.length > 0) {
        const { data: countResult } = await supabase
          .rpc('generate_recurring_appointments', {
            parent_appointment_id: created[0].id,
          });
        const instanceCount = typeof countResult === 'number' ? countResult : 0;
        alert(`Appointment scheduled! ${instanceCount} recurring instance${instanceCount !== 1 ? 's' : ''} created.`);
      } else {
        alert('Appointment created successfully!');
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating appointment:', error);
      alert('Failed to create appointment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-8 max-w-2xl w-full">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 md:items-center md:p-0">
      {/* Mobile: Padded full width, Desktop: Max width modal */}
      <div className="bg-white w-full max-w-full sm:max-w-2xl my-4 md:my-8 rounded-lg shadow-xl flex flex-col max-h-[calc(100vh-2rem)]">
        {/* Header - Always visible */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200 bg-white shrink-0 rounded-t-lg">
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900 pr-2">
            {calendarContext === 'my' ? 'Add to My Calendar' : 'Schedule Appointment'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form - Scrollable on mobile */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
          {/* Appointment Type Selector - Only show for Technician Calendar */}
          {calendarContext === 'technicians' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Appointment Type *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { value: 'customer_meeting', label: 'Customer Meeting', icon: <User className="w-4 h-4" />, color: 'border-blue-500 bg-blue-50 text-blue-700' },
                  { value: 'work_order', label: 'Work Order', icon: <Clock className="w-4 h-4" />, color: 'border-blue-500 bg-blue-50 text-blue-700' },
                  { value: 'personal', label: 'Personal Event', icon: <Calendar className="w-4 h-4" />, color: 'border-blue-500 bg-blue-50 text-blue-700' },
                  { value: 'shop_time', label: 'Shop Time', icon: <Wrench className="w-4 h-4" />, color: 'border-amber-500 bg-amber-50 text-amber-700' },
                  { value: 'training', label: 'Training', icon: <BookOpen className="w-4 h-4" />, color: 'border-teal-500 bg-teal-50 text-teal-700' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAppointmentType(opt.value as AppointmentType)}
                    className={`min-h-[48px] flex items-center justify-center gap-2 px-3 py-3 border-2 rounded-lg font-medium transition-all touch-manipulation text-sm ${
                      appointmentType === opt.value
                        ? opt.color
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Privacy Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {isPrivate ? (
                  <Lock className="w-5 h-5 text-gray-700" />
                ) : (
                  <Unlock className="w-5 h-5 text-gray-400" />
                )}
                <span className="font-medium text-gray-900">
                  {isPrivate ? 'Private' : 'Public'}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {isPrivate
                  ? 'Only visible to you and assigned technician'
                  : 'Visible to all team members'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors touch-manipulation ${
                isPrivate ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  isPrivate ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={getTitlePlaceholder()}
              required
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
            />
          </div>

          {/* Customer - Required for customer meetings in Technician Calendar, optional in My Calendar */}
          {(calendarContext === 'technicians' && appointmentType === 'customer_meeting') || calendarContext === 'my' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {calendarContext === 'my' ? 'Related Customer (Optional)' : 'Customer *'}
              </label>
              <ContactSearchSelect
                contacts={contacts.map(c => ({
                  id: c.id,
                  label: `${c.first_name} ${c.last_name}`.trim(),
                  sublabel: c.email || undefined,
                }))}
                value={selectedContactId}
                onChange={setSelectedContactId}
                placeholder="Search or select customer..."
                required={calendarContext === 'technicians' && appointmentType === 'customer_meeting'}
                disabled={!!contactId}
                darkMode={false}
              />
            </div>
          ) : null}

          {/* Project - Show when customer is selected */}
          {selectedContactId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Related Project (Optional)
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={!!projectId}
                className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 text-base"
              >
                <option value="">No project</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.project_number} - {project.project_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date and All-Day Toggle */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                required
                className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
              />
            </div>

            {/* All-Day Toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allDay"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="allDay" className="text-sm font-medium text-gray-700">
                All-day event
              </label>
            </div>
          </div>

          {/* Time Fields - Hidden for all-day events */}
          {!allDay && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time *
                </label>
                <select
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required={!allDay}
                  className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base bg-white"
                >
                  <option value="">Select time...</option>
                  {timeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time *
                </label>
                <select
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required={!allDay}
                  className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base bg-white"
                >
                  <option value="">Select time...</option>
                  {timeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Recurrence */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recurrence
            </label>
            <RecurrenceSelector
              value={recurrenceRule}
              onChange={setRecurrenceRule}
              startDate={appointmentDate || undefined}
            />
          </div>

          {/* Technician - Only show for Technician Calendar */}
          {calendarContext === 'technicians' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {appointmentType === 'personal' ? 'Assigned To' : 'Assigned Technician *'}
              </label>
              {appointmentType === 'personal' ? (
                <div className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 flex items-center text-base">
                  <User className="w-5 h-5 mr-2 text-gray-500" />
                  You ({profile?.full_name || 'Current User'})
                </div>
              ) : (
                <select
                  value={technicianId}
                  onChange={(e) => setTechnicianId(e.target.value)}
                  required={appointmentType !== 'personal'}
                  className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                >
                  <option value="">Select technician...</option>
                  {technicians.map(tech => (
                    <option key={tech.id} value={tech.id}>
                      {tech.full_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Customer site, Office, Remote"
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Add any special instructions or notes..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
            />
          </div>
        </form>

        {/* Footer - Always visible */}
        <div className="flex flex-col sm:flex-row gap-3 p-4 md:p-6 border-t border-gray-200 bg-white shrink-0 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[48px] px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium touch-manipulation"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full sm:flex-1 min-h-[48px] px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium touch-manipulation"
          >
            <Save className="w-5 h-5" />
            {submitting ? 'Saving...' : (calendarContext === 'my' ? 'Add to Calendar' : 'Schedule Appointment')}
          </button>
        </div>
      </div>
    </div>
  );
}
