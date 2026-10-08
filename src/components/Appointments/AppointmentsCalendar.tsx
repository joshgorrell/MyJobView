import { CalendarMonthGrid } from '../Shared/Calendar/CalendarMonthGrid';
import { CalendarGantt } from '../Shared/Calendar/CalendarGantt';
import { CalendarWorkspace } from '../Shared/Calendar/CalendarWorkspace';
import { CalendarNavigation, CalendarViewSwitcher } from '../Shared/Calendar/CalendarControls';
import { CalendarTimeGrid, type CalendarGridEvent } from '../Shared/Calendar/CalendarTimeGrid';
import { weekDates, monthDates, calendarPeriodDays, addDays, minutes, timeKey, timeLabel } from '../../lib/workOrderScheduling';
import { calendarDateKey, createTimestampInTimezone, formatTimeInTimezone, formatDateInTimezone, getOrganizationTimezone } from '../../lib/timezoneUtils';
import { useState, useEffect, useRef, ReactNode } from 'react';
import { Calendar as CalendarIcon, Plus, Users, Clock, CheckCircle2, AlertCircle, Wrench, Settings, User, Lock, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CreateAppointmentModal } from './CreateAppointmentModal';
import { CalendarManagementModal } from './CalendarManagementModal';
import { RecurringEditScopeModal, RecurringEditScope } from '../Shared/RecurringEditScopeModal';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';
import { rescheduleWorkOrder, rescheduleAppointment } from '../../lib/scheduling';

interface Appointment {
  id: string;
  title: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  customer_name: string;
  technician_name: string;
  technician_id?: string;
  isWorkOrder?: boolean;
  isReminder?: boolean;
  reminderType?: 'task' | 'lead' | 'discussion' | 'scheduled_connection' | 'internal_time' | 'time_off';
  appointment_type?: 'customer_meeting' | 'personal' | 'work_order' | 'other';
  is_private?: boolean;
  all_day?: boolean;
  is_blocked?: boolean;
  can_view_details?: boolean;
  rollover_count?: number;
  is_recurring_parent?: boolean;
  recurrence_parent_id?: string | null;
}

interface Technician {
  id: string;
  full_name: string;
  role: string;
  employment_type?: string;
}


type ViewMode = 'month' | 'week' | 'day' | 'gantt' | 'agenda';
type AgendaGrouping = 'all' | 'week' | 'month';
type DateRangeFilter = '30' | '90' | '180' | 'all';

export function AppointmentsCalendar({ personalOnly = false, technicianOnly = false, onWorkOrderSelect, initialView = 'day', initialDate, initialTechnicianIds, embedded = false, onViewChange, onDateChange, onDayView }: { personalOnly?: boolean; technicianOnly?: boolean; onWorkOrderSelect?: (id: string) => void; initialView?: ViewMode; initialDate?: string; initialTechnicianIds?: string[]; embedded?: boolean; onViewChange?: (view: ViewMode) => void; onDateChange?: (date: string) => void; onDayView?: (date: string) => void } = {}) {
  const { profile } = useAuth();
  const [currentDate, setCurrentDate] = useState(initialDate ? new Date(initialDate + 'T12:00:00') : new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [loadError,setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [draggedAppointment, setDraggedAppointment] = useState<Appointment | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [storedCalendarView, setCalendarView] = useState<'my' | 'technicians' | 'shared'>('my');
  const calendarView = personalOnly ? 'my' : technicianOnly ? 'technicians' : storedCalendarView;
  const [sharedCalendarMemberIds, setSharedCalendarMemberIds] = useState<string[]>([]);
  const [calendarTechnicianIds] = useState(() => initialTechnicianIds || new URLSearchParams(window.location.search).get('technicianIds')?.split(',').filter(Boolean) || []);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [draggedItem, setDraggedItem] = useState<{ appointment: Appointment; sourceTime: string } | null>(null);
  const [showCalendarManagement, setShowCalendarManagement] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [savingDefault, setSavingDefault] = useState(false);
  const [localDefault, setLocalDefault] = useState<string | null>(null);

  // Agenda view state
  const [agendaGrouping, setAgendaGrouping] = useState<AgendaGrouping>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>('90');
  const [agendaAppointments, setAgendaAppointments] = useState<Appointment[]>([]);
  const calendarLoadId = useRef(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [agendaTypeFilter, setAgendaTypeFilter] = useState<string[]>([]);
  const [agendaStatusFilter, setAgendaStatusFilter] = useState<string[]>([]);

  // Drag-to-create state
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | undefined>();
  const [selectedEndTime, setSelectedEndTime] = useState<string | null>(null);

  useEffect(() => {
    onDateChange?.(calendarDateKey(currentDate));
    if (viewMode === 'day' && onDayView) onDayView(calendarDateKey(currentDate));
    else onViewChange?.(viewMode);
  }, [currentDate, viewMode]);

  // Recurring delete scope modal
  const [recurringDeleteTarget, setRecurringDeleteTarget] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!profile?.id || !profile.organization_id) return;
    loadCalendars();

    // Check for URL parameters to restore state (for pop-out window)
    if (personalOnly) {
      if (initialDate) return;
      void getOrganizationTimezone().then(tz => setCurrentDate(new Date(formatDateInTimezone(new Date().toISOString(),tz)+'T12:00:00')));
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('popup') === 'true') {
      const view = params.get('view') as 'my' | 'technicians' | 'shared' | null;
      const mode = params.get('viewMode') as ViewMode | null;
      const date = params.get('date');
      const calId = params.get('calendarId');

      if (view && ['my', 'technicians', 'shared'].includes(view)) setCalendarView(view);
      if (mode && ['day', 'week', 'month', 'gantt', 'agenda'].includes(mode)) setViewMode(mode);
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date + 'T12:00:00').getTime())) setCurrentDate(new Date(date + 'T12:00:00'));
      if (calId) setSelectedCalendarId(calId);
    } else if (profile) {
      // Restore saved default calendar preference
      const saved = (profile as any).default_calendar_view as string | null;
      if (saved) {
        setLocalDefault(saved);
        if (saved === 'my' || saved === 'technicians') {
          setCalendarView(saved as 'my' | 'technicians');
        } else {
          setCalendarView('shared');
          setSelectedCalendarId(saved);
        }
      }
    }
  }, [profile?.id, profile?.organization_id]);

  useEffect(() => {
    if (!profile?.id || !profile.organization_id) return;
    if (viewMode === 'agenda') {
      loadAgendaAppointments();
    } else {
      loadAppointments();
    }
    if (calendarView === 'technicians') {
      loadTechnicians();
    } else if (calendarView === 'shared' && selectedCalendarId) {
      loadSharedCalendarMembers(selectedCalendarId);
    }
    return () => { calendarLoadId.current += 1; };
  }, [currentDate, viewMode, calendarView, selectedCalendarId, dateRangeFilter, profile?.id, profile?.organization_id]);

  // Filter agenda appointments when filters change
  useEffect(() => {
    if (viewMode === 'agenda') {
      filterAgendaAppointments();
    }
  }, [agendaTypeFilter, agendaStatusFilter, allAppointments, viewMode, sharedCalendarMemberIds]);

  useEffect(() => {
    filterAppointments();
  }, [calendarView, allAppointments, sharedCalendarMemberIds, profile?.id]);


  // Real-time subscription for appointments and work orders
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (viewMode === 'agenda') {
          loadAgendaAppointments();
        } else {
          loadAppointments();
        }
      }, 500);
    };

    const channel = supabase
      .channel('appointments-calendar-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, debouncedReload)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      channel.unsubscribe();
    };
  }, [viewMode, currentDate, calendarView, selectedCalendarId]);

  async function loadSharedCalendarMembers(calendarId: string) {
    try {
      const { data: members } = await supabase
        .from('calendar_members')
        .select('user_id')
        .eq('calendar_id', calendarId);
      setSharedCalendarMemberIds(members ? members.map((m: any) => m.user_id) : []);
    } catch (err) {
      console.error('Error loading shared calendar members:', err);
      setSharedCalendarMemberIds([]);
    }
  }

  function filterAppointments() {
    if (calendarView === 'my' && profile) {
      setAppointments(allAppointments.filter(apt => apt.technician_id === profile.id));
    } else if (calendarView === 'shared' && sharedCalendarMemberIds.length > 0) {
      setAppointments(allAppointments.filter(apt => apt.technician_id && sharedCalendarMemberIds.includes(apt.technician_id)));
    } else if (calendarView === 'shared') {
      setAppointments(allAppointments);
    } else {
      setAppointments(calendarTechnicianIds.length ? allAppointments.filter(apt => apt.technician_id && calendarTechnicianIds.includes(apt.technician_id)) : allAppointments);
    }
  }

  async function loadCalendars() {
    try {
      const { data, error } = await supabase
        .rpc('get_user_calendars', { user_id_param: profile?.id });

      if (error) throw error;

      const calendarsData = data?.map((cal: any) => ({
        id: cal.calendar_id,
        name: cal.calendar_name,
        color: cal.calendar_color,
        is_default: cal.is_default,
        member_count: parseInt(cal.member_count)
      })) || [];

      setCalendars(calendarsData);

      // Auto-select default calendar if none selected
      if (!technicianOnly && new URLSearchParams(window.location.search).get('popup') !== 'true' && !selectedCalendarId && calendarsData.length > 0) {
        const defaultCal = calendarsData.find((c: any) => c.is_default);
        if (defaultCal) {
          setSelectedCalendarId(defaultCal.id);
        }
      }
    } catch (error) {
      console.error('Error loading calendars:', error);
    }
  }

  async function saveDefaultCalendarView(value: string) {
    if (!profile?.id || savingDefault) return;
    setSavingDefault(true);
    try {
      await supabase
        .from('profiles')
        .update({ default_calendar_view: value })
        .eq('id', profile.id);
      setLocalDefault(value);
    } catch (err) {
      console.error('Error saving default calendar preference:', err);
    } finally {
      setSavingDefault(false);
    }
  }

  async function setDefaultCalendarForCustom(calendarId: string) {
    if (!profile?.id || savingDefault) return;
    setSavingDefault(true);
    try {
      await supabase
        .from('profiles')
        .update({ default_calendar_view: calendarId })
        .eq('id', profile.id);
      setLocalDefault(calendarId);
      await loadCalendars();
    } catch (err) {
      console.error('Error setting default calendar:', err);
    } finally {
      setSavingDefault(false);
    }
  }

  async function loadTechnicians() {
    try {
      let query = supabase
        .from('profiles')
        .select('id, full_name, role, employment_type')
        .eq('is_active', true);

      // If viewing "My Calendar", only show the current user
      if (calendarView === 'my' && profile) {
        query = query.eq('id', profile.id);
      } else if (calendarView === 'technicians') {
        query = query.eq('is_technician', true);
        if (calendarTechnicianIds.length) query = query.in('id', calendarTechnicianIds);
        // If viewing "Technician Calendar", filter by calendar membership if a calendar is selected
        if (selectedCalendarId) {
          const { data: members } = await supabase
            .from('calendar_members')
            .select('user_id')
            .eq('calendar_id', selectedCalendarId);

          if (members && members.length > 0) {
            const userIds = members.map(m => m.user_id);
            query = query.in('id', userIds);
          } else {
            // No members in calendar, show no technicians
            setTechnicians([]);
            return;
          }
        }
      }

      const { data, error } = await query.order('full_name');

      if (error) throw error;
      setTechnicians(data || []);
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  }



  async function handleTimeDrop(appointment: Appointment, newTime: string, newTechId?: string, targetDate?: string) {
    if (appointment.can_view_details === false || appointment.all_day || appointment.is_blocked || appointment.isReminder) return;
    const newDate = targetDate || appointment.appointment_date;
    const targetTechId = newTechId || appointment.technician_id;
    if (!targetTechId) return;

    const oldTime = appointment.start_time.slice(0, 5);
    const targetTech = technicians.find(t => t.id === targetTechId);

    // Calculate new end time (maintain duration)
    const duration = minutes(appointment.end_time) - minutes(appointment.start_time);
    const endMinutes = minutes(newTime) + duration;
    if (duration <= 0 || endMinutes >= 1440) { alert('Choose a time that ends on the same day.'); return; }
    const newEndTime = timeKey(endMinutes);

    // Build confirmation message
    let confirmMessage = `Reschedule "${appointment.title}"?\n\n`;
    confirmMessage += `From: ${appointment.appointment_date} ${oldTime} - ${appointment.end_time.slice(0, 5)}\n`;
    confirmMessage += `To: ${newDate} ${newTime} - ${newEndTime}\n`;

    if (newTechId && newTechId !== appointment.technician_id) {
      confirmMessage += `\nReassign from: ${appointment.technician_name}\n`;
      confirmMessage += `To: ${targetTech?.full_name}\n`;
    }

    confirmMessage += `\nDate: ${new Date(newDate + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })}\n`;
    confirmMessage += `\nDo you want to proceed?`;

    const doTimeDrop = async () => {
      const hasConflict = await checkForConflicts(
        newDate,
        newTime,
        newEndTime,
        targetTechId,
        appointment.id
      );

      if (hasConflict) {
        setConfirmModal({
          title: 'Scheduling Conflict',
          message: `⚠️ SCHEDULING CONFLICT\n\n${conflictWarning}\n\nDo you still want to reschedule?`,
          onConfirm: () => doTimeDropForce(true)
        });
        return;
      }

      await doTimeDropForce();
    };

    const doTimeDropForce = async (force = false) => {
      try {
        const dateStr = newDate;

        if (appointment.isWorkOrder) {
          const result = await rescheduleWorkOrder(
            appointment.id, dateStr, newTime, newEndTime,
            newTechId || undefined,
            { force }
          );
          if (!result.success) throw new Error(result.error || 'Failed to reschedule');
        } else {
          const result = await rescheduleAppointment(
            appointment.id, dateStr, newTime, newEndTime,
            newTechId || undefined,
            { force }
          );
          if (!result.success) throw new Error(result.error || 'Failed to reschedule');
        }

        await loadAppointments();
      } catch (error) {
        console.error('Error rescheduling:', error);
        alert('Failed to reschedule. Please try again.');
      } finally {
        setDraggedItem(null);
          setConflictWarning(null);
      }
    };

    setConfirmModal({
      title: appointment.isWorkOrder ? 'Move work order' : 'Move appointment',
      message: confirmMessage,
      onConfirm: () => doTimeDrop()
    });
  }

  async function checkForConflicts(date: string, startTime: string, endTime: string, technicianId: string, excludeId?: string): Promise<boolean> {
    try {
      const [aptRes, woRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, title, start_time, end_time')
          .eq('appointment_date', date)
          .eq('assigned_technician', technicianId)
          .neq('status', 'cancelled'),
        supabase
          .from('work_orders')
          .select('id, title, work_order_number, scheduled_start_time, scheduled_end_time, estimated_hours')
          .eq('scheduled_date', date)
          .eq('assigned_to', technicianId)
          .not('status', 'in', '("completed","cancelled","archived")'),
      ]);

      if (aptRes.error) throw aptRes.error;
      if (woRes.error) throw woRes.error;

      const timesOverlap = (s: string, e: string, existingStart: string, existingEnd: string) =>
        (s >= existingStart && s < existingEnd) ||
        (e > existingStart && e <= existingEnd) ||
        (s <= existingStart && e >= existingEnd);

      const aptConflicts = (aptRes.data || []).filter(apt => {
        if (excludeId && apt.id === excludeId) return false;
        return timesOverlap(startTime, endTime, apt.start_time, apt.end_time);
      });

      const woConflicts = (woRes.data || []).filter(wo => {
        if (excludeId && wo.id === excludeId) return false;
        const woStart = wo.scheduled_start_time || '08:00';
        let woEnd = wo.scheduled_end_time;
        if (!woEnd) {
          const hours = wo.estimated_hours || 2;
          const endMin = minutes(woStart) + hours * 60;
          const eh = Math.floor(endMin / 60);
          const em = endMin % 60;
          woEnd = `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
        }
        return timesOverlap(startTime, endTime, woStart, woEnd);
      });

      const totalConflicts = aptConflicts.length + woConflicts.length;

      if (totalConflicts > 0) {
        const parts: string[] = [];
        if (aptConflicts.length > 0) parts.push(`${aptConflicts.length} appointment(s)`);
        if (woConflicts.length > 0) parts.push(`${woConflicts.length} work order(s)`);
        setConflictWarning(`Technician already has ${parts.join(' and ')} at this time`);
        return true;
      }

      setConflictWarning(null);
      return false;
    } catch (error) {
      console.error('Error checking conflicts:', error);
      return false;
    }
  }

  async function loadAppointments() {
    const requestId = ++calendarLoadId.current;
    setLoading(true);
    try {
      let startDate: Date;
      let endDate: Date;

      if (viewMode === 'month') {
        const days = monthDates(calendarDateKey(currentDate));
        startDate = new Date(days[0] + 'T12:00:00');
        endDate = new Date(days[days.length - 1] + 'T12:00:00');
      } else if (viewMode === 'gantt') {
        startDate = new Date(currentDate);
        endDate = new Date(addDays(calendarDateKey(currentDate), 13) + 'T12:00:00');
      } else if (viewMode === 'week') {
        const day = currentDate.getDay();
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - ((day + 6) % 7));
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
      } else {
        startDate = new Date(currentDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(currentDate);
        endDate.setHours(23, 59, 59, 999);
      }

      // Get current user ID
      const timezone=await getOrganizationTimezone();
      const rangeStart=createTimestampInTimezone(calendarDateKey(startDate),'00:00',timezone);
      const nextDay=new Date(endDate);nextDay.setDate(nextDay.getDate()+1);
      const rangeEnd=new Date(Date.parse(createTimestampInTimezone(calendarDateKey(nextDay),'00:00',timezone))-1).toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Load appointments using privacy-aware function, work orders, reminders, and scheduled connections
      const [appointmentsRes, workOrdersRes, tasksRes, leadsRes, discussionsRes, scheduledConnectionsRes, internalRes, ptoRes] = await Promise.all([
        supabase.rpc('get_appointments_with_privacy', {
          p_user_id: user.id,
          p_company_id: profile?.organization_id || user.id,
          p_start_date: calendarDateKey(startDate),
          p_end_date: calendarDateKey(endDate)
        }),
        supabase
          .from('work_orders')
          .select(`
            id,
            work_order_number,
            scheduled_date,
            scheduled_start_time,
            scheduled_end_time,
            status,
            assigned_to,
            project:projects!work_orders_project_id_fkey (
              id,
              project_number,
              contact:contacts!projects_contact_id_fkey (
                first_name,
                last_name
              )
            ),
            assigned_technician:profiles!work_orders_assigned_to_fkey (
              full_name
            )
          `)
          .not('scheduled_date', 'is', null)
          .gte('scheduled_date', calendarDateKey(startDate))
          .lte('scheduled_date', calendarDateKey(endDate))
          .order('scheduled_date')
          .order('scheduled_start_time'),
        // Load task reminders
        supabase
          .from('tasks')
          .select(`
            id,
            title,
            reminder_date,
            assigned_to,
            status,
            profiles:assigned_to (
              full_name
            )
          `)
          .not('reminder_date', 'is', null)
          .gte('reminder_date', rangeStart)
          .lte('reminder_date', rangeEnd),
        // Load lead reminders
        supabase
          .from('leads')
          .select(`
            id,
            company_name,
            contact_name,
            reminder_date,
            assigned_to,
            status,
            profiles:assigned_to (
              full_name
            )
          `)
          .not('reminder_date', 'is', null)
          .gte('reminder_date', rangeStart)
          .lte('reminder_date', rangeEnd),
        // Load discussion post reminders
        supabase
          .from('discussion_posts')
          .select(`
            id,
            content,
            reminder_date,
            user_id,
            profiles:user_id (
              full_name
            )
          `)
          .not('reminder_date', 'is', null)
          .gte('reminder_date', rangeStart)
          .lte('reminder_date', rangeEnd),
        // Load scheduled connection occurrences
        supabase
          .from('scheduled_connection_occurrences')
          .select(`
            id,
            occurrence_date,
            status,
            rollover_count,
            scheduled_connection:scheduled_connections (
              id,
              prospect_name,
              connection_type,
              notes,
              created_by,
              contact:contacts (
                full_name
              ),
              creator:profiles!scheduled_connections_created_by_fkey (
                full_name
              )
            )
          `)
          .eq('status', 'pending')
          .gte('occurrence_date', calendarDateKey(startDate))
          .lte('occurrence_date', calendarDateKey(endDate))
        ,supabase.from('internal_time_sessions').select('id,title,session_date,start_time,end_time,predetermined_hours,status,assigned_to')
          .eq('assigned_to',user.id).in('status',['scheduled','in_progress','completed'])
          .gte('session_date',calendarDateKey(startDate)).lte('session_date',calendarDateKey(endDate)),
        supabase.from('pto_requests').select('id,employee_id,start_date,end_date,request_type')
          .eq('employee_id',user.id).eq('status','approved')
          .lte('start_date',calendarDateKey(endDate)).gte('end_date',calendarDateKey(startDate)),
      ]);

      if (appointmentsRes.error) throw appointmentsRes.error;
      if (workOrdersRes.error) throw workOrdersRes.error;
      if (tasksRes.error) throw tasksRes.error;
      if (leadsRes.error) throw leadsRes.error;
      if (discussionsRes.error) throw discussionsRes.error;
      if (scheduledConnectionsRes.error) throw scheduledConnectionsRes.error;

      // Format appointments
      const formattedAppointments = (appointmentsRes.data || []).map((apt: any) => ({
        id: apt.id,
        title: apt.title,
        appointment_date: apt.appointment_date,
        start_time: apt.start_time || '00:00',
        end_time: apt.end_time || '23:59',
        status: apt.status,
        technician_id: apt.assigned_technician,
        customer_name: apt.contact_id ? 'Customer' : '',
        technician_name: apt.can_view_details ? (apt.assigned_technician ? 'Assigned' : 'Unassigned') : 'Busy',
        appointment_type: apt.appointment_type,
        is_private: apt.is_private,
        all_day: apt.all_day,
        is_blocked: apt.is_blocked,
        can_view_details: apt.can_view_details,
        is_recurring_parent: apt.is_recurring_parent,
        recurrence_parent_id: apt.recurrence_parent_id,
      }));

      // Format work orders to match appointment structure
      const formattedWorkOrders = (workOrdersRes.data || []).map((wo: any) => ({
        id: wo.id,
        title: `WO-${wo.work_order_number}`,
        appointment_date: wo.scheduled_date,
        start_time: wo.scheduled_start_time || '09:00',
        end_time: wo.scheduled_end_time || '17:00',
        status: wo.status,
        technician_id: wo.assigned_to,
        customer_name: wo.project?.contact
          ? `${wo.project.contact.first_name} ${wo.project.contact.last_name}`.trim()
          : 'Unknown',
        technician_name: wo.assigned_technician?.full_name || 'Unassigned',
        isWorkOrder: true
      }));

      // Format task reminders
      const formattedTasks = (tasksRes.data || []).map((task: any) => {
        const reminderDate = new Date(task.reminder_date);
        return {
          id: task.id,
          title: `Task: ${task.title}`,
          appointment_date: formatDateInTimezone(reminderDate.toISOString(),timezone),
          start_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          end_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          status: task.status,
          technician_id: task.assigned_to,
          customer_name: 'Reminder',
          technician_name: task.profiles?.full_name || 'Unassigned',
          isReminder: true,
          reminderType: 'task' as const
        };
      });

      // Format lead reminders
      const formattedLeads = (leadsRes.data || []).map((lead: any) => {
        const reminderDate = new Date(lead.reminder_date);
        const leadTitle = lead.company_name || lead.contact_name || 'Unnamed Lead';
        return {
          id: lead.id,
          title: `Lead: ${leadTitle}`,
          appointment_date: formatDateInTimezone(reminderDate.toISOString(),timezone),
          start_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          end_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          status: lead.status,
          technician_id: lead.assigned_to,
          customer_name: 'Reminder',
          technician_name: lead.profiles?.full_name || 'Unassigned',
          isReminder: true,
          reminderType: 'lead' as const
        };
      });

      // Format discussion reminders
      const formattedDiscussions = (discussionsRes.data || []).map((post: any) => {
        const reminderDate = new Date(post.reminder_date);
        const previewText = post.content.substring(0, 30) + (post.content.length > 30 ? '...' : '');
        return {
          id: post.id,
          title: `Note: ${previewText}`,
          appointment_date: formatDateInTimezone(reminderDate.toISOString(),timezone),
          start_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          end_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          status: 'pending',
          technician_id: post.user_id,
          customer_name: 'Reminder',
          technician_name: post.profiles?.full_name || 'Unknown',
          isReminder: true,
          reminderType: 'discussion' as const
        };
      });

      // Format scheduled connection occurrences
      const formattedConnections = (scheduledConnectionsRes.data || []).map((occ: any) => {
        const prospectName = occ.scheduled_connection?.contact?.full_name || occ.scheduled_connection?.prospect_name || 'Unknown';
        const connectionType = occ.scheduled_connection?.connection_type || 'Connection';
        const isOverdue = occ.rollover_count >= 2;
        const titlePrefix = isOverdue ? '⚠️ ' : '';

        return {
          id: occ.id,
          title: `${titlePrefix}${connectionType}: ${prospectName}`,
          appointment_date: occ.occurrence_date,
          start_time: '09:00',
          end_time: '09:30',
          status: occ.status,
          technician_id: occ.scheduled_connection?.created_by,
          customer_name: prospectName,
          technician_name: occ.scheduled_connection?.creator?.full_name || 'Unknown',
          isReminder: true,
          reminderType: 'scheduled_connection' as const,
          rollover_count: occ.rollover_count
        };
      });

      if(internalRes.error) throw internalRes.error;
      if(ptoRes.error) throw ptoRes.error;
      const internalEvents = (internalRes.data || []).map(session => ({
        id:session.id, title:session.title + (!session.start_time ? ' (time not scheduled)' : ''), appointment_date:session.session_date,
        start_time:session.start_time || '00:00', end_time:session.end_time || '23:59',
        all_day:!session.start_time, status:session.status, technician_id:session.assigned_to,
        technician_name:'',customer_name:'Approved internal session',isReminder:true,reminderType:'internal_time' as const,
      }));
      const ptoEvents: Appointment[] = [];
      for(const pto of ptoRes.data || []) {
        const from = pto.start_date > calendarDateKey(startDate) ? pto.start_date : calendarDateKey(startDate);
        const to = pto.end_date < calendarDateKey(endDate) ? pto.end_date : calendarDateKey(endDate);
        for(let day=new Date(from+'T12:00Z'); day.toISOString().slice(0,10)<=to; day.setUTCDate(day.getUTCDate()+1)) {
          const date=day.toISOString().slice(0,10);
          ptoEvents.push({id:pto.id+'-'+date,title:pto.request_type==='full_day'?'Approved Time Off':'Approved Partial Time Off (see request for hours)',
            appointment_date:date,start_time:'00:00',end_time:'23:59',all_day:true,status:'approved',technician_id:pto.employee_id,
            technician_name:'',customer_name:'Time Off',isReminder:true,reminderType:'time_off'});
        }
      }

      // Combine and sort by date and time
      const combined = [
        ...formattedAppointments,
        ...formattedWorkOrders,
        ...formattedTasks,
        ...formattedLeads,
        ...formattedDiscussions,
        ...formattedConnections,
        ...internalEvents,
        ...ptoEvents
      ].sort((a, b) => {
        const dateCompare = a.appointment_date.localeCompare(b.appointment_date);
        if (dateCompare !== 0) return dateCompare;
        return a.start_time.localeCompare(b.start_time);
      });

      if (requestId !== calendarLoadId.current) return;
      setAllAppointments(combined);
      setLoadError('');
    } catch (error) {
      if (requestId !== calendarLoadId.current) return;
      console.error('Error loading calendar items:', error);
      setLoadError('Unable to load all calendar items. Refresh this view to try again.');
    } finally {
      if (requestId === calendarLoadId.current) setLoading(false);
    }
  }

  async function loadAgendaAppointments() {
    const requestId = ++calendarLoadId.current;
    setLoading(true);
    try {
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      let endDate = new Date();
      if (dateRangeFilter === '30') {
        endDate.setDate(endDate.getDate() + 30);
      } else if (dateRangeFilter === '90') {
        endDate.setDate(endDate.getDate() + 90);
      } else if (dateRangeFilter === '180') {
        endDate.setDate(endDate.getDate() + 180);
      } else {
        // 'all' - load 1 year ahead
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      const timezone=await getOrganizationTimezone();
      const rangeStart=createTimestampInTimezone(calendarDateKey(startDate),'00:00',timezone);
      const nextDay=new Date(endDate);nextDay.setDate(nextDay.getDate()+1);
      const rangeEnd=new Date(Date.parse(createTimestampInTimezone(calendarDateKey(nextDay),'00:00',timezone))-1).toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Load appointments using privacy-aware function, work orders, reminders, and scheduled connections
      const [appointmentsRes, workOrdersRes, tasksRes, leadsRes, discussionsRes, scheduledConnectionsRes] = await Promise.all([
        supabase.rpc('get_appointments_with_privacy', {
          p_user_id: user.id,
          p_company_id: profile?.organization_id || user.id,
          p_start_date: calendarDateKey(startDate),
          p_end_date: calendarDateKey(endDate)
        }),
        supabase
          .from('work_orders')
          .select(`
            id,
            work_order_number,
            scheduled_date,
            scheduled_start_time,
            scheduled_end_time,
            status,
            assigned_to,
            project:projects!work_orders_project_id_fkey (
              id,
              project_number,
              contact:contacts!projects_contact_id_fkey (
                first_name,
                last_name
              )
            ),
            assigned_technician:profiles!work_orders_assigned_to_fkey (
              full_name
            )
          `)
          .not('scheduled_date', 'is', null)
          .gte('scheduled_date', calendarDateKey(startDate))
          .lte('scheduled_date', calendarDateKey(endDate))
          .order('scheduled_date')
          .order('scheduled_start_time'),
        supabase
          .from('tasks')
          .select(`
            id,
            title,
            reminder_date,
            assigned_to,
            status,
            profiles:assigned_to (
              full_name
            )
          `)
          .not('reminder_date', 'is', null)
          .gte('reminder_date', rangeStart)
          .lte('reminder_date', rangeEnd),
        supabase
          .from('leads')
          .select(`
            id,
            company_name,
            contact_name,
            reminder_date,
            assigned_to,
            status,
            profiles:assigned_to (
              full_name
            )
          `)
          .not('reminder_date', 'is', null)
          .gte('reminder_date', rangeStart)
          .lte('reminder_date', rangeEnd),
        supabase
          .from('discussion_posts')
          .select(`
            id,
            content,
            reminder_date,
            user_id,
            profiles:user_id (
              full_name
            )
          `)
          .not('reminder_date', 'is', null)
          .gte('reminder_date', rangeStart)
          .lte('reminder_date', rangeEnd),
        supabase
          .from('scheduled_connection_occurrences')
          .select(`
            id,
            occurrence_date,
            status,
            rollover_count,
            scheduled_connection:scheduled_connections (
              id,
              prospect_name,
              connection_type,
              notes,
              created_by,
              contact:contacts (
                full_name
              ),
              creator:profiles!scheduled_connections_created_by_fkey (
                full_name
              )
            )
          `)
          .eq('status', 'pending')
          .gte('occurrence_date', calendarDateKey(startDate))
          .lte('occurrence_date', calendarDateKey(endDate))
      ]);

      if (appointmentsRes.error) throw appointmentsRes.error;
      if (workOrdersRes.error) throw workOrdersRes.error;
      if (tasksRes.error) throw tasksRes.error;
      if (leadsRes.error) throw leadsRes.error;
      if (discussionsRes.error) throw discussionsRes.error;
      if (scheduledConnectionsRes.error) throw scheduledConnectionsRes.error;

      // Format appointments (same as loadAppointments)
      const formattedAppointments = (appointmentsRes.data || []).map((apt: any) => ({
        id: apt.id,
        title: apt.title,
        appointment_date: apt.appointment_date,
        start_time: apt.start_time || '00:00',
        end_time: apt.end_time || '23:59',
        status: apt.status,
        technician_id: apt.assigned_technician,
        customer_name: apt.contact_id ? 'Customer' : '',
        technician_name: apt.can_view_details ? (apt.assigned_technician ? 'Assigned' : 'Unassigned') : 'Busy',
        appointment_type: apt.appointment_type,
        is_private: apt.is_private,
        all_day: apt.all_day,
        is_blocked: apt.is_blocked,
        can_view_details: apt.can_view_details,
        is_recurring_parent: apt.is_recurring_parent,
        recurrence_parent_id: apt.recurrence_parent_id,
      }));

      const formattedWorkOrders = (workOrdersRes.data || []).map((wo: any) => ({
        id: wo.id,
        title: `WO-${wo.work_order_number}`,
        appointment_date: wo.scheduled_date,
        start_time: wo.scheduled_start_time || '09:00',
        end_time: wo.scheduled_end_time || '17:00',
        status: wo.status,
        technician_id: wo.assigned_to,
        customer_name: wo.project?.contact
          ? `${wo.project.contact.first_name} ${wo.project.contact.last_name}`.trim()
          : 'Unknown',
        technician_name: wo.assigned_technician?.full_name || 'Unassigned',
        isWorkOrder: true
      }));

      const formattedTasks = (tasksRes.data || []).map((task: any) => {
        const reminderDate = new Date(task.reminder_date);
        return {
          id: task.id,
          title: `Task: ${task.title}`,
          appointment_date: formatDateInTimezone(reminderDate.toISOString(),timezone),
          start_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          end_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          status: task.status,
          technician_id: task.assigned_to,
          customer_name: 'Reminder',
          technician_name: task.profiles?.full_name || 'Unassigned',
          isReminder: true,
          reminderType: 'task' as const
        };
      });

      const formattedLeads = (leadsRes.data || []).map((lead: any) => {
        const reminderDate = new Date(lead.reminder_date);
        const leadTitle = lead.company_name || lead.contact_name || 'Unnamed Lead';
        return {
          id: lead.id,
          title: `Lead: ${leadTitle}`,
          appointment_date: formatDateInTimezone(reminderDate.toISOString(),timezone),
          start_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          end_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          status: lead.status,
          technician_id: lead.assigned_to,
          customer_name: 'Reminder',
          technician_name: lead.profiles?.full_name || 'Unassigned',
          isReminder: true,
          reminderType: 'lead' as const
        };
      });

      const formattedDiscussions = (discussionsRes.data || []).map((post: any) => {
        const reminderDate = new Date(post.reminder_date);
        const previewText = post.content.substring(0, 30) + (post.content.length > 30 ? '...' : '');
        return {
          id: post.id,
          title: `Note: ${previewText}`,
          appointment_date: formatDateInTimezone(reminderDate.toISOString(),timezone),
          start_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          end_time: formatTimeInTimezone(reminderDate.toISOString(),timezone),
          status: 'pending',
          technician_id: post.user_id,
          customer_name: 'Reminder',
          technician_name: post.profiles?.full_name || 'Unknown',
          isReminder: true,
          reminderType: 'discussion' as const
        };
      });

      const formattedConnections = (scheduledConnectionsRes.data || []).map((occ: any) => {
        const prospectName = occ.scheduled_connection?.contact?.full_name || occ.scheduled_connection?.prospect_name || 'Unknown';
        const connectionType = occ.scheduled_connection?.connection_type || 'Connection';
        const isOverdue = occ.rollover_count >= 2;
        const titlePrefix = isOverdue ? '⚠️ ' : '';

        return {
          id: occ.id,
          title: `${titlePrefix}${connectionType}: ${prospectName}`,
          appointment_date: occ.occurrence_date,
          start_time: '09:00',
          end_time: '09:30',
          status: occ.status,
          technician_id: occ.scheduled_connection?.created_by,
          customer_name: prospectName,
          technician_name: occ.scheduled_connection?.creator?.full_name || 'Unknown',
          isReminder: true,
          reminderType: 'scheduled_connection' as const,
          rollover_count: occ.rollover_count
        };
      });

      const combined = [
        ...formattedAppointments,
        ...formattedWorkOrders,
        ...formattedTasks,
        ...formattedLeads,
        ...formattedDiscussions,
        ...formattedConnections
      ].sort((a, b) => {
        const dateCompare = a.appointment_date.localeCompare(b.appointment_date);
        if (dateCompare !== 0) return dateCompare;
        return a.start_time.localeCompare(b.start_time);
      });

      if (requestId !== calendarLoadId.current) return;
      setAllAppointments(combined);
    } catch (error) {
      if (requestId !== calendarLoadId.current) return;
      console.error('Error loading agenda appointments:', error);
    } finally {
      if (requestId === calendarLoadId.current) setLoading(false);
    }
  }

  function filterAgendaAppointments() {
    let filtered = allAppointments.filter(apt => {
      if (calendarView === 'my') return apt.technician_id === profile?.id;
      if (calendarView === 'shared' && sharedCalendarMemberIds.length > 0) {
        return apt.technician_id ? sharedCalendarMemberIds.includes(apt.technician_id) : false;
      }
      return true;
    });

    // Apply type filter
    if (agendaTypeFilter.length > 0) {
      filtered = filtered.filter(apt => {
        if (agendaTypeFilter.includes('appointment') && apt.appointment_type && !apt.isWorkOrder && !apt.isReminder) return true;
        if (agendaTypeFilter.includes('work_order') && apt.isWorkOrder) return true;
        if (agendaTypeFilter.includes('personal') && apt.appointment_type === 'personal') return true;
        if (agendaTypeFilter.includes('reminder') && apt.isReminder) return true;
        return false;
      });
    }

    // Apply status filter
    if (agendaStatusFilter.length > 0) {
      filtered = filtered.filter(apt => agendaStatusFilter.includes(apt.status));
    }

    setAgendaAppointments(filtered);
  }

  function navigateDate(direction: 'prev' | 'next') {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else if (viewMode === 'week' || viewMode === 'gantt') {
      newDate.setDate(currentDate.getDate() + (direction === 'next' ? 1 : -1) * calendarPeriodDays(viewMode));
    } else {
      newDate.setDate(currentDate.getDate() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
  }



  function getAppointmentsForDate(date: Date): Appointment[] {
    return appointments.filter(apt => apt.appointment_date === calendarDateKey(date));
  }

  function openCreateModal(date?: Date, time?: string, end?: string, technicianId?: string) {
    setSelectedEndTime(end || null);
    setSelectedTechnicianId(technicianId);
    if (date) {
      setSelectedDate(calendarDateKey(date));
    } else {
      setSelectedDate(null);
    }
    setSelectedTime(time || null);
    setShowCreateModal(true);
  }

  function getWeekOfYear(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  function getWeekRange(date: Date): string {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    return `Week of ${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  function groupAppointmentsByView() {
    if (agendaGrouping === 'all') {
      // Group by date
      const grouped = new Map<string, Appointment[]>();
      agendaAppointments.forEach(apt => {
        if (!grouped.has(apt.appointment_date)) {
          grouped.set(apt.appointment_date, []);
        }
        grouped.get(apt.appointment_date)!.push(apt);
      });
      return Array.from(grouped.entries()).map(([date, items]) => ({ label: date, items }));
    } else if (agendaGrouping === 'week') {
      // Group by week
      const grouped = new Map<string, { label: string; items: Appointment[] }>();
      agendaAppointments.forEach(apt => {
        const date = new Date(apt.appointment_date);
        const weekKey = `${date.getFullYear()}-W${getWeekOfYear(date)}`;
        if (!grouped.has(weekKey)) {
          grouped.set(weekKey, { label: getWeekRange(date), items: [] });
        }
        grouped.get(weekKey)!.items.push(apt);
      });
      return Array.from(grouped.values());
    } else {
      // Group by month
      const grouped = new Map<string, { label: string; items: Appointment[] }>();
      agendaAppointments.forEach(apt => {
        const date = new Date(apt.appointment_date);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        if (!grouped.has(monthKey)) {
          grouped.set(monthKey, {
            label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            items: []
          });
        }
        grouped.get(monthKey)!.items.push(apt);
      });
      return Array.from(grouped.values());
    }
  }

  function toggleTypeFilter(type: string) {
    setAgendaTypeFilter(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }

  function toggleStatusFilter(status: string) {
    setAgendaStatusFilter(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  }

  function isRecurring(apt: Appointment): boolean {
    return !!(apt.is_recurring_parent || apt.recurrence_parent_id);
  }

  function requestDeleteAppointment(apt: Appointment) {
    if (apt.can_view_details === false) return;
    if (isRecurring(apt)) {
      setRecurringDeleteTarget(apt);
    } else {
      setConfirmModal({
        title: 'Delete Appointment',
        message: `Are you sure you want to delete "${apt.title}"? This action cannot be undone.`,
        onConfirm: () => doDeleteAppointment(apt.id, 'this'),
      });
    }
  }

  async function doDeleteAppointment(aptId: string, scope: RecurringEditScope) {
    try {
      if (scope === 'this') {
        await supabase.from('appointments').delete().eq('id', aptId);
      } else if (scope === 'this_and_future') {
        const apt = allAppointments.find(a => a.id === aptId);
        const parentId = apt?.recurrence_parent_id || aptId;
        const cutoffDate = apt?.appointment_date || formatDateInTimezone(new Date().toISOString(),await getOrganizationTimezone());
        await supabase
          .from('appointments')
          .delete()
          .eq('recurrence_parent_id', parentId)
          .gte('appointment_date', cutoffDate)
          .neq('status', 'completed');
        if (!apt?.recurrence_parent_id) {
          await supabase.from('appointments').delete().eq('id', aptId);
        }
      } else {
        const apt = allAppointments.find(a => a.id === aptId);
        const parentId = apt?.recurrence_parent_id || aptId;
        await supabase
          .from('appointments')
          .delete()
          .eq('recurrence_parent_id', parentId)
          .neq('status', 'completed');
        await supabase.from('appointments').delete().eq('id', parentId);
      }
      await loadAppointments();
    } catch (error) {
      console.error('Error deleting appointment:', error);
      alert('Failed to delete appointment');
    }
    setRecurringDeleteTarget(null);
  }

  function formatDateHeader() {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (viewMode === 'week') {
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - ((currentDate.getDay() + 6) % 7));
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  }

  if (!(profile as any)?.has_calendar_access) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center max-w-md mx-auto">
          <CalendarIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Calendar Access Disabled</h3>
          <p className="text-gray-400">
            Your calendar access has been disabled by an administrator. Please contact your admin if you need access to this feature.
          </p>
        </div>
      </div>
    );
  }

  const activeTabKey = (calendarView === 'technicians' || calendarView === 'shared') && selectedCalendarId
    ? selectedCalendarId
    : calendarView;
  const currentDefault = localDefault ?? ((profile as any)?.default_calendar_view as string | null) ?? 'my';

  function handleTabSelect(key: string) {
    if (key === 'my') {
      setCalendarView('my');
      setSelectedCalendarId(null);
      setSharedCalendarMemberIds([]);
    } else if (key === 'technicians') {
      setCalendarView('technicians');
      setSelectedCalendarId(null);
      setSharedCalendarMemberIds([]);
      if (viewMode === 'agenda') setViewMode('day');
    } else {
      setCalendarView('shared');
      setSelectedCalendarId(key);
      setSharedCalendarMemberIds([]);
    }
  }

  const timeGridDates = (viewMode === 'month' ? monthDates(calendarDateKey(currentDate)) : viewMode === 'gantt' ? Array.from({ length: 14 }, (_, i) => addDays(calendarDateKey(currentDate), i)) : viewMode === 'week' ? weekDates(calendarDateKey(currentDate)) : [calendarDateKey(currentDate)]).map(date => new Date(date + 'T12:00:00'));
  const techTimeline = calendarView === 'technicians' && viewMode === 'day';
  const timeGridColumns = techTimeline ? technicians.map(tech => ({ key: tech.id, date: calendarDateKey(currentDate), label: tech.full_name })) : timeGridDates.map(date => ({ key: calendarDateKey(date), date: calendarDateKey(date), label: date.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + date.getDate() }));
  const timeGridEvents: CalendarGridEvent[] = timeGridDates.flatMap(date => getAppointmentsForDate(date).map(apt => ({
    id: apt.id, columnKey: techTimeline ? apt.technician_id || 'unassigned' : calendarDateKey(date), start: apt.start_time?.slice(0, 5) || '00:00', end: apt.isReminder && apt.start_time && apt.end_time === apt.start_time ? timeKey(minutes(apt.start_time) + 30) : apt.end_time?.slice(0, 5) || '24:00',
    title: apt.title, kind: apt.isWorkOrder ? 'work_order' : apt.is_blocked || apt.reminderType === 'time_off' ? 'time_off' : apt.isReminder ? 'reminder' : 'appointment',
    allDay: apt.all_day || !apt.start_time || !apt.end_time,
    draggable: apt.can_view_details !== false && !apt.all_day && !apt.isReminder && !apt.is_blocked && apt.status !== 'completed' && apt.status !== 'cancelled',
    onDragStart: event => { if (techTimeline) setDraggedItem({ appointment: apt, sourceTime: apt.start_time }); else setDraggedAppointment(apt); event.dataTransfer.effectAllowed = 'move'; },
    onDragEnd: () => { setDraggedAppointment(null); setDraggedItem(null); },
    content: <><div className="font-semibold truncate">{apt.isWorkOrder ? <button type="button" onClick={() => { if (onWorkOrderSelect) onWorkOrderSelect(apt.id); else window.location.assign(`/?tab=work_orders&workOrderId=${apt.id}`); }} className="hover:underline text-left">{apt.title}</button> : <button type="button" onClick={() => setSelectedEventId(selectedEventId === apt.id ? null : apt.id)} className="hover:underline text-left">{apt.title}</button>}</div>
      <div className="truncate">{apt.all_day ? 'All day' : apt.start_time === apt.end_time ? timeLabel(apt.start_time) : `${timeLabel(apt.start_time)} – ${timeLabel(apt.end_time)}`}</div>
      {apt.technician_name && <div className="truncate">{apt.technician_name}</div>}
      {apt.can_view_details !== false && !apt.isWorkOrder && !apt.isReminder && apt.status !== 'completed' && !apt.is_blocked && <button type="button" onClick={e => { e.stopPropagation(); requestDeleteAppointment(apt); }} className="text-red-700 hover:underline" aria-label={'Delete ' + apt.title}>Delete</button>}</>,
  })));

  return (
    <CalendarWorkspace embedded={embedded} loading={loading} className="space-y-6" tabHref={'/calendar?' + new URLSearchParams({ popup: 'true', view: calendarView, viewMode, date: calendarDateKey(currentDate), calendarId: selectedCalendarId || '', technicianIds: calendarTechnicianIds.join(',') }).toString()}>
      {loadError && <p role="alert" className="text-red-600 text-sm">{loadError}</p>}
      {/* Header: two rows */}
      <div className="space-y-3 bg-slate-800 rounded-xl p-3">
        {/* Row 1: title, date nav, and action controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              {calendarView === 'my'
                ? 'Calendar'
                : calendarView === 'shared' && selectedCalendarId
                  ? (calendars.find(c => c.id === selectedCalendarId)?.name ?? 'Shared Calendar')
                  : selectedCalendarId
                    ? (calendars.find(c => c.id === selectedCalendarId)?.name ?? 'Tech Calendar')
                    : 'Tech Calendar'}
            </h2>
            <span className="px-2.5 py-0.5 bg-blue-600 text-white text-xs sm:text-sm rounded-full whitespace-nowrap">
              {viewMode === 'agenda' ? agendaAppointments.length : appointments.length}{' '}
              {(viewMode === 'agenda' ? agendaAppointments.length : appointments.length) === 1 ? 'item' : 'items'}
            </span>
            <CalendarNavigation date={calendarDateKey(currentDate)} onDateChange={date => setCurrentDate(new Date(date + 'T12:00:00'))} onPrevious={() => navigateDate('prev')} onNext={() => navigateDate('next')} />
            <span className="text-sm font-medium text-white">{formatDateHeader()}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <CalendarViewSwitcher value={viewMode} onChange={setViewMode} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'gantt', label: 'Gantt' }, ...((calendarView === 'my' || calendarView === 'shared') ? [{ value: 'agenda' as const, label: 'Agenda' }] : [])]} />

            {/* Manage Calendars — always visible for eligible roles */}
            {profile && ['admin', 'manager', 'field_supervisor'].includes(profile.role) && (
              <button
                onClick={() => setShowCalendarManagement(true)}
                className="p-2 bg-white/10 text-white hover:bg-white/20 rounded-lg transition-colors"
                title="Manage Calendars"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* Add Event */}
            <button
              onClick={() => openCreateModal()}
              className="px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New event</span>
            </button>
          </div>
        </div>

        {/* Row 2: Calendar Tab Rail */}
        {!personalOnly && <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {!technicianOnly && <CalendarTab
            label="My Calendar"
            icon={<User className="w-3.5 h-3.5" />}
            color={null}
            isActive={activeTabKey === 'my'}
            isDefault={currentDefault === 'my'}
            onSelect={() => handleTabSelect('my')}
            onSetDefault={() => saveDefaultCalendarView('my')}
            savingDefault={savingDefault}
          />}
          <CalendarTab
            label="Tech Calendar"
            icon={<Users className="w-3.5 h-3.5" />}
            color={null}
            isActive={activeTabKey === 'technicians'}
            isDefault={currentDefault === 'technicians'}
            onSelect={() => handleTabSelect('technicians')}
            onSetDefault={() => saveDefaultCalendarView('technicians')}
            savingDefault={savingDefault}
          />
          {calendars.map(cal => (
            <CalendarTab
              key={cal.id}
              label={cal.name}
              icon={null}
              color={cal.color}
              isActive={activeTabKey === cal.id}
              isDefault={currentDefault === cal.id}
              onSelect={() => handleTabSelect(cal.id)}
              onSetDefault={() => setDefaultCalendarForCustom(cal.id)}
              savingDefault={savingDefault}
            />
          ))}
        </div>}
      </div>

      {viewMode === 'month' && <CalendarMonthGrid date={calendarDateKey(currentDate)} events={timeGridEvents.map(event => ({ ...event, date: event.columnKey }))} loading={loading} error={loadError} onRetry={() => { void loadAppointments(); }}
        onDateSelect={date => { setCurrentDate(new Date(date + 'T12:00:00')); setViewMode('day'); }} onEventSelect={event => { if (event.kind === 'work_order') { if (onWorkOrderSelect) onWorkOrderSelect(event.id); else window.location.assign(`/?tab=work_orders&workOrderId=${event.id}`); } else { setCurrentDate(new Date(event.date + 'T12:00:00')); setViewMode('day'); setSelectedEventId(event.id); } }}
        onEventDrop={date => { if (draggedAppointment) void handleTimeDrop(draggedAppointment, draggedAppointment.start_time.slice(0, 5), undefined, date); }} />}
      {viewMode === 'gantt' && <CalendarGantt dates={timeGridDates.map(calendarDateKey)} tracks={calendarView === 'my' ? [{ id: profile!.id, label: profile!.full_name || 'My Calendar' }] : calendarView === 'technicians' ? technicians.map(tech => ({ id: tech.id, label: tech.full_name })) : Array.from(new Map(appointments.filter(apt => apt.technician_id).map(apt => [apt.technician_id!, { id: apt.technician_id!, label: apt.technician_name || 'Calendar member' }])).values())}
        events={timeGridEvents.map(event => ({ ...event, date: event.columnKey, technicianId: appointments.find(apt => apt.id === event.id)?.technician_id || '' }))} loading={loading} error={loadError} onRetry={() => { void loadAppointments(); }}
        onDateSelect={date => { setCurrentDate(new Date(date + 'T12:00:00')); setViewMode('day'); }} onEventSelect={event => { if (event.kind === 'work_order') { if (onWorkOrderSelect) onWorkOrderSelect(event.id); else window.location.assign(`/?tab=work_orders&workOrderId=${event.id}`); } else { setCurrentDate(new Date(event.date + 'T12:00:00')); setViewMode('day'); setSelectedEventId(event.id); } }}
        onEventDrop={(date, techId) => { if (draggedAppointment) void handleTimeDrop(draggedAppointment, draggedAppointment.start_time.slice(0, 5), techId, date); }} />}

      {/* Day and week share the same grid used when scheduling work orders. */}
      {(viewMode === 'week' || viewMode === 'day') && (
        <div className="space-y-2">
          <CalendarTimeGrid columns={timeGridColumns} events={timeGridEvents} loading={loading} error={loadError} onRetry={() => { void loadAppointments(); }}
            onSlotSelect={(column, time) => openCreateModal(new Date(column.date + 'T12:00:00'), time, undefined, techTimeline ? column.key : undefined)}
            onRangeSelect={(column, start, end) => { if (timeGridEvents.some(event => event.columnKey === column.key && (event.allDay || minutes(start) < minutes(event.end) && minutes(end) > minutes(event.start)))) { alert('Choose an open time range.'); return; } openCreateModal(new Date(column.date + 'T12:00:00'), start, end, techTimeline ? column.key : undefined); }}
            onDropDate={column => { const item = techTimeline ? draggedItem?.appointment : draggedAppointment; if (item) void handleTimeDrop(item, item.start_time.slice(0, 5), techTimeline ? column.key : undefined, column.date); }}
            onDropSlot={(column, start) => { const item = techTimeline ? draggedItem?.appointment : draggedAppointment; if (item) void handleTimeDrop(item, start, techTimeline ? column.key : undefined, column.date); }}
            slotState={(column, start) => ({ disabled: timeGridEvents.some(event => event.columnKey === column.key && (event.allDay || minutes(start) < minutes(event.end) && minutes(start) + 30 > minutes(event.start))) })} />
          {appointments.filter(apt => apt.id === selectedEventId).map(apt => <div key={apt.id} className="rounded-lg border border-gray-200 bg-white p-4 text-gray-900">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{apt.title}</h3><StatusBadge status={apt.status} /><button type="button" onClick={() => setSelectedEventId(null)} className="min-h-11 px-3 text-sm">Close details</button></div>
            <p className="text-sm">{apt.all_day ? 'All day' : apt.start_time === apt.end_time ? timeLabel(apt.start_time) : `${timeLabel(apt.start_time)} – ${timeLabel(apt.end_time)}`}{apt.technician_name ? ` · ${apt.technician_name}` : ''}</p>
            {apt.customer_name && <p className="text-sm">{apt.customer_name}</p>}
            {apt.can_view_details !== false && !apt.isWorkOrder && !apt.isReminder && apt.status !== 'completed' && !apt.is_blocked && <button type="button" onClick={() => requestDeleteAppointment(apt)} className="min-h-11 text-sm text-red-700 hover:underline">Delete appointment</button>}
          </div>)}
          <p className="text-xs text-gray-500">Click an open time or drag across time slots to add an event. Drag an appointment to another day to reschedule.</p>
        </div>
      )}

      {/* Agenda View - List of all upcoming events */}
      {viewMode === 'agenda' && (calendarView === 'my' || calendarView === 'shared') && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              {/* Date Range Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Show:</span>
                <select
                  value={dateRangeFilter}
                  onChange={(e) => setDateRangeFilter(e.target.value as DateRangeFilter)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="30">Next 30 days</option>
                  <option value="90">Next 90 days</option>
                  <option value="180">Next 6 months</option>
                  <option value="all">All upcoming</option>
                </select>
              </div>

              {/* Grouping Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Group by:</span>
                <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setAgendaGrouping('all')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      agendaGrouping === 'all'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:bg-white/50'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setAgendaGrouping('week')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      agendaGrouping === 'week'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:bg-white/50'
                    }`}
                  >
                    Week
                  </button>
                  <button
                    onClick={() => setAgendaGrouping('month')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      agendaGrouping === 'month'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:bg-white/50'
                    }`}
                  >
                    Month
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600">Type:</span>
                <button
                  onClick={() => toggleTypeFilter('appointment')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    agendaTypeFilter.includes('appointment')
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Appointments
                </button>
                <button
                  onClick={() => toggleTypeFilter('work_order')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    agendaTypeFilter.includes('work_order')
                      ? 'bg-orange-100 text-orange-700 border border-orange-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Work Orders
                </button>
                <button
                  onClick={() => toggleTypeFilter('personal')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    agendaTypeFilter.includes('personal')
                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Personal
                </button>
                <button
                  onClick={() => toggleTypeFilter('reminder')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    agendaTypeFilter.includes('reminder')
                      ? 'bg-purple-100 text-purple-700 border border-purple-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Reminders
                </button>
              </div>
              <div className="h-4 w-px bg-gray-300"></div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600">Status:</span>
                <button
                  onClick={() => toggleStatusFilter('scheduled')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    agendaStatusFilter.includes('scheduled')
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Scheduled
                </button>
                <button
                  onClick={() => toggleStatusFilter('in_progress')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    agendaStatusFilter.includes('in_progress')
                      ? 'bg-amber-100 text-amber-700 border border-amber-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  In Progress
                </button>
              </div>
              {(agendaTypeFilter.length > 0 || agendaStatusFilter.length > 0) && (
                <button
                  onClick={() => {
                    setAgendaTypeFilter([]);
                    setAgendaStatusFilter([]);
                  }}
                  className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  Clear Filters ({agendaTypeFilter.length + agendaStatusFilter.length})
                </button>
              )}
            </div>
          </div>

          {/* Agenda List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="max-h-[700px] overflow-y-auto">
              {agendaAppointments.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <CalendarIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium text-gray-700 mb-2">No upcoming events</p>
                  <p className="text-sm text-gray-500 mb-4">You're all caught up!</p>
                  <button
                    onClick={() => openCreateModal()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    New event
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {groupAppointmentsByView().map((group, groupIndex) => (
                    <div key={groupIndex}>
                      {/* Group Header */}
                      <div className="bg-gray-50 px-4 py-2 sticky top-0 z-10 border-b border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700">
                          {agendaGrouping === 'all'
                            ? new Date(group.label).toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              })
                            : group.label}
                        </h3>
                      </div>

                      {/* Events in Group */}
                      {group.items.map((apt) => (
                        <div
                          key={apt.id}
                          onClick={() => setSelectedEventId(selectedEventId === apt.id ? null : apt.id)}
                          className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                            selectedEventId === apt.id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Icon */}
                            <div className="flex-shrink-0 mt-0.5">
                              {apt.isWorkOrder ? (
                                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                                  <Wrench className="w-4 h-4 text-orange-600" />
                                </div>
                              ) : apt.isReminder ? (
                                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                                  <AlertCircle className="w-4 h-4 text-purple-600" />
                                </div>
                              ) : apt.appointment_type === 'personal' ? (
                                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                                  <User className="w-4 h-4 text-indigo-600" />
                                </div>
                              ) : apt.is_blocked ? (
                                <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center">
                                  <Lock className="w-4 h-4 text-gray-600" />
                                </div>
                              ) : (
                                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                  <CalendarIcon className="w-4 h-4 text-blue-600" />
                                </div>
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              {/* Date (only shown in week/month grouping) */}
                              {agendaGrouping !== 'all' && (
                                <div className="text-xs text-gray-500 mb-1">
                                  {new Date(apt.appointment_date).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </div>
                              )}

                              {/* Title and Time */}
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-gray-700">
                                  {apt.start_time.slice(0, 5)}
                                </span>
                                <span className="text-xs text-gray-400">•</span>
                                <h4 className="text-sm font-medium text-gray-900 truncate">
                                  {apt.isWorkOrder ? <button type="button" onClick={event => { event.stopPropagation(); if (onWorkOrderSelect) onWorkOrderSelect(apt.id); else window.location.assign(`/?tab=work_orders&workOrderId=${apt.id}`); }} className="text-blue-600 hover:underline text-left">{apt.title}</button> : apt.title}
                                </h4>
                              </div>

                              {/* Customer */}
                              {apt.customer_name && apt.customer_name !== 'Reminder' && (
                                <p className="text-xs text-gray-600 truncate">{apt.customer_name}</p>
                              )}

                              {/* Expanded Details */}
                              {selectedEventId === apt.id && (
                                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="text-gray-500">Time:</span>
                                      <span className="ml-1 text-gray-900 font-medium">
                                        {apt.start_time.slice(0, 5)} - {apt.end_time.slice(0, 5)}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Status:</span>
                                      <span className="ml-1 text-gray-900 font-medium capitalize">
                                        {apt.status.replace('_', ' ')}
                                      </span>
                                    </div>
                                    {apt.isReminder && (
                                      <div className="col-span-2">
                                        <span className="text-gray-500">Type:</span>
                                        <span className="ml-1 text-gray-900 font-medium capitalize">
                                          {apt.reminderType} Reminder
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-2 pt-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCurrentDate(new Date(apt.appointment_date+'T12:00:00'));
                                        setViewMode('day');
                                      }}
                                      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                    >
                                      View in Calendar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Status Badge */}
                            <div className="flex-shrink-0">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  apt.status === 'completed'
                                    ? 'bg-green-100 text-green-700'
                                    : apt.status === 'in_progress'
                                    ? 'bg-amber-100 text-amber-700'
                                    : apt.status === 'cancelled'
                                    ? 'bg-gray-100 text-gray-600'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {apt.status === 'completed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                {apt.status === 'in_progress' && <Clock className="w-3 h-3 mr-1" />}
                                {apt.status.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateAppointmentModal
          calendarContext={calendarView === 'my' ? 'my' : 'technicians'}
          initialTechnicianId={selectedTechnicianId}
          initialDate={selectedDate || undefined}
          initialTime={selectedTime || undefined}
          initialEndTime={selectedEndTime || undefined}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedDate(null);
            setSelectedTime(null);
            setSelectedEndTime(null);
          }}
          onSuccess={() => {
            loadAppointments();
            setShowCreateModal(false);
            setSelectedDate(null);
            setSelectedTime(null);
            setSelectedEndTime(null);
          }}
        />
      )}

      <CalendarManagementModal
        isOpen={showCalendarManagement}
        onClose={() => {
          setShowCalendarManagement(false);
          loadCalendars();
        }}
        onCalendarChange={(calendarId) => {
          setSelectedCalendarId(calendarId);
          setShowCalendarManagement(false);
          loadCalendars();
        }}
        currentCalendarId={selectedCalendarId}
      />

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        variant={confirmModal?.title.includes('Delete') ? 'danger' : 'neutral'}
        confirmLabel={confirmModal?.title.includes('Delete') ? 'Delete' : 'Confirm move'}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />

      {recurringDeleteTarget && (
        <RecurringEditScopeModal
          action="delete"
          onSelect={(scope) => doDeleteAppointment(recurringDeleteTarget.id, scope)}
          onClose={() => setRecurringDeleteTarget(null)}
        />
      )}
    </CalendarWorkspace>
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

interface CalendarTabProps {
  label: string;
  icon: ReactNode | null;
  color: string | null;
  isActive: boolean;
  isDefault: boolean;
  onSelect: () => void;
  onSetDefault: () => void;
  savingDefault: boolean;
}

function CalendarTab({ label, icon, color, isActive, isDefault, onSelect, onSetDefault, savingDefault }: CalendarTabProps) {
  return (
    <div className="relative group flex-shrink-0">
      <button
        onClick={onSelect}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all border ${
          isActive
            ? 'bg-white text-gray-900 border-white shadow-sm'
            : 'bg-white/10 text-white border-white/20 hover:bg-white/20 hover:border-white/30'
        }`}
      >
        {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
        {icon && !color && <span className={isActive ? 'text-gray-700' : 'text-white/80'}>{icon}</span>}
        <span className="whitespace-nowrap">{label}</span>
        {isDefault && (
          <Star className={`w-3 h-3 flex-shrink-0 ${isActive ? 'text-amber-500 fill-amber-500' : 'text-amber-400 fill-amber-400'}`} />
        )}
      </button>
      {!isDefault && (
        <button
          onClick={(e) => { e.stopPropagation(); onSetDefault(); }}
          disabled={savingDefault}
          title="Set as default calendar"
          className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all
            opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100
            ${savingDefault ? 'bg-gray-400 cursor-not-allowed' : 'bg-amber-400 hover:bg-amber-500'} shadow-md`}
        >
          <Star className="w-2.5 h-2.5 text-white" />
        </button>
      )}
    </div>
  );
}
