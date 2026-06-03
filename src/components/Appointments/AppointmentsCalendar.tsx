import { useState, useEffect, useRef, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, AlertTriangle, Users, Clock, CheckCircle2, AlertCircle, Wrench, LayoutList, LayoutGrid, Settings, Maximize2, User, Lock, Star, Repeat } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CreateAppointmentModal } from './CreateAppointmentModal';
import { CalendarManagementModal } from './CalendarManagementModal';
import { RecurringEditScopeModal, RecurringEditScope } from '../Shared/RecurringEditScopeModal';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

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
  reminderType?: 'task' | 'lead' | 'discussion' | 'scheduled_connection';
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

interface TechnicianStats {
  technician_id: string;
  technician_name: string;
  total_items: number;
  work_orders: number;
  appointments: number;
  completed: number;
  in_progress: number;
  pending: number;
}

type ViewMode = 'month' | 'week' | 'day' | 'agenda';
type TechnicianViewMode = 'timeline' | 'list';
type AgendaGrouping = 'all' | 'week' | 'month';
type DateRangeFilter = '30' | '90' | '180' | 'all';

export function AppointmentsCalendar() {
  const { profile } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [draggedAppointment, setDraggedAppointment] = useState<Appointment | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [calendarView, setCalendarView] = useState<'my' | 'technicians' | 'shared'>('my');
  const [sharedCalendarMemberIds, setSharedCalendarMemberIds] = useState<string[]>([]);
  const [technicianViewMode, setTechnicianViewMode] = useState<TechnicianViewMode>('timeline');
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [technicianStats, setTechnicianStats] = useState<TechnicianStats[]>([]);
  const [draggedItem, setDraggedItem] = useState<{ appointment: Appointment; sourceTime: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ techId: string; time: string } | null>(null);
  const [showCalendarManagement, setShowCalendarManagement] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [savingDefault, setSavingDefault] = useState(false);
  const [localDefault, setLocalDefault] = useState<string | null>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  // Agenda view state
  const [agendaGrouping, setAgendaGrouping] = useState<AgendaGrouping>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>('90');
  const [agendaAppointments, setAgendaAppointments] = useState<Appointment[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [agendaTypeFilter, setAgendaTypeFilter] = useState<string[]>([]);
  const [agendaStatusFilter, setAgendaStatusFilter] = useState<string[]>([]);

  // Drag-to-create state
  const [dragSelectStart, setDragSelectStart] = useState<string | null>(null);
  const [dragSelectEnd, setDragSelectEnd] = useState<string | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [selectedEndTime, setSelectedEndTime] = useState<string | null>(null);

  // Recurring delete scope modal
  const [recurringDeleteTarget, setRecurringDeleteTarget] = useState<Appointment | null>(null);

  useEffect(() => {
    loadCalendars();

    // Check for URL parameters to restore state (for pop-out window)
    const params = new URLSearchParams(window.location.search);
    if (params.get('popup') === 'true') {
      const view = params.get('view') as 'my' | 'technicians' | 'shared' | null;
      const mode = params.get('viewMode') as ViewMode | null;
      const date = params.get('date');
      const calId = params.get('calendarId');

      if (view) setCalendarView(view);
      if (mode) setViewMode(mode);
      if (date) setCurrentDate(new Date(date));
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
  }, []);

  useEffect(() => {
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
  }, [currentDate, viewMode, calendarView, selectedCalendarId, dateRangeFilter]);

  // Filter agenda appointments when filters change
  useEffect(() => {
    if (viewMode === 'agenda') {
      filterAgendaAppointments();
    }
  }, [agendaTypeFilter, agendaStatusFilter, allAppointments, viewMode, sharedCalendarMemberIds]);

  useEffect(() => {
    filterAppointments();
  }, [calendarView, allAppointments, sharedCalendarMemberIds]);

  useEffect(() => {
    if (calendarView === 'technicians') {
      calculateTechnicianStats();
    }
  }, [appointments, calendarView]);

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

  // Scroll to today's date when calendar loads or view changes
  useEffect(() => {
    if (viewMode === 'month' && todayRef.current && !loading) {
      // Small delay to ensure DOM is fully rendered
      setTimeout(() => {
        todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [viewMode, currentDate, loading]);

  function filterAppointments() {
    if (calendarView === 'my' && profile) {
      setAppointments(allAppointments.filter(apt => apt.technician_id === profile.id));
    } else if (calendarView === 'shared' && sharedCalendarMemberIds.length > 0) {
      setAppointments(allAppointments.filter(apt => apt.technician_id && sharedCalendarMemberIds.includes(apt.technician_id)));
    } else if (calendarView === 'shared') {
      setAppointments(allAppointments);
    } else {
      setAppointments(allAppointments);
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
      if (!selectedCalendarId && calendarsData.length > 0) {
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
        } else {
          // No calendar selected, show only technicians by default
          query = query.eq('role', 'tech');
        }
      }

      const { data, error } = await query.order('full_name');

      if (error) throw error;
      setTechnicians(data || []);
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  }

  function calculateTechnicianStats() {
    const statsMap = new Map<string, TechnicianStats>();

    appointments.forEach(apt => {
      if (!apt.technician_id) return;

      if (!statsMap.has(apt.technician_id)) {
        statsMap.set(apt.technician_id, {
          technician_id: apt.technician_id,
          technician_name: apt.technician_name,
          total_items: 0,
          work_orders: 0,
          appointments: 0,
          completed: 0,
          in_progress: 0,
          pending: 0
        });
      }

      const stats = statsMap.get(apt.technician_id)!;
      stats.total_items++;

      if (apt.isWorkOrder) {
        stats.work_orders++;
      } else if (!apt.isReminder) {
        stats.appointments++;
      }

      const status = apt.status.toLowerCase();
      if (status === 'completed') {
        stats.completed++;
      } else if (status === 'in_progress' || status === 'in progress' || status === 'on_my_way') {
        stats.in_progress++;
      } else {
        stats.pending++;
      }
    });

    setTechnicianStats(Array.from(statsMap.values()));
  }

  function getTechnicianAppointments(technicianId: string): Appointment[] {
    return appointments.filter(apt => apt.technician_id === technicianId);
  }

  function generateTimeSlots(): string[] {
    const slots: string[] = [];
    for (let hour = 6; hour < 22; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    return slots;
  }

  function getAppointmentsForTimeSlot(timeSlot: string): Appointment[] {
    const slotHour = parseInt(timeSlot.split(':')[0]);
    return appointments.filter(apt => {
      const aptHour = parseInt(apt.start_time.split(':')[0]);
      return aptHour === slotHour;
    });
  }

  function getAppointmentForTimeSlot(technicianId: string, timeSlot: string): Appointment | null {
    const techAppts = getTechnicianAppointments(technicianId);
    return techAppts.find(apt => {
      const aptHour = parseInt(apt.start_time.split(':')[0]);
      const slotHour = parseInt(timeSlot.split(':')[0]);
      return aptHour === slotHour;
    }) || null;
  }

  async function handleTimeDrop(appointment: Appointment, newTime: string, newTechId?: string) {
    const targetTechId = newTechId || appointment.technician_id;
    if (!targetTechId) return;

    const oldTime = appointment.start_time.slice(0, 5);
    const targetTech = technicians.find(t => t.id === targetTechId);

    // Calculate new end time (maintain duration)
    const oldStartHour = parseInt(appointment.start_time.split(':')[0]);
    const oldStartMin = parseInt(appointment.start_time.split(':')[1]);
    const oldEndHour = parseInt(appointment.end_time.split(':')[0]);
    const oldEndMin = parseInt(appointment.end_time.split(':')[1]);
    const durationHours = oldEndHour - oldStartHour;
    const durationMins = oldEndMin - oldStartMin;

    const newStartHour = parseInt(newTime.split(':')[0]);
    const newStartMin = parseInt(newTime.split(':')[1]);
    const newEndHour = newStartHour + durationHours;
    const newEndMin = newStartMin + durationMins;
    const newEndTime = `${newEndHour.toString().padStart(2, '0')}:${newEndMin.toString().padStart(2, '0')}`;

    // Build confirmation message
    let confirmMessage = `Reschedule "${appointment.title}"?\n\n`;
    confirmMessage += `From: ${oldTime} - ${appointment.end_time.slice(0, 5)}\n`;
    confirmMessage += `To: ${newTime} - ${newEndTime}\n`;

    if (newTechId && newTechId !== appointment.technician_id) {
      confirmMessage += `\nReassign from: ${appointment.technician_name}\n`;
      confirmMessage += `To: ${targetTech?.full_name}\n`;
    }

    confirmMessage += `\nDate: ${new Date(appointment.appointment_date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })}\n`;
    confirmMessage += `\nDo you want to proceed?`;

    const doTimeDrop = async () => {
      const hasConflict = await checkForConflicts(
        appointment.appointment_date,
        newTime,
        newEndTime,
        targetTechId,
        appointment.id
      );

      if (hasConflict) {
        setConfirmModal({
          title: 'Scheduling Conflict',
          message: `⚠️ SCHEDULING CONFLICT\n\n${conflictWarning}\n\nDo you still want to reschedule?`,
          onConfirm: () => doTimeDropForce()
        });
        return;
      }

      await doTimeDropForce();
    };

    const doTimeDropForce = async () => {
      try {
        if (appointment.isWorkOrder) {
          // Update work order
          const { error } = await supabase
            .from('work_orders')
            .update({
              scheduled_start_time: newTime,
              scheduled_end_time: newEndTime,
              ...(newTechId && { assigned_to: newTechId })
            })
            .eq('id', appointment.id);

          if (error) throw error;
        } else {
          // Update appointment
          const updateData: any = {
            start_time: newTime,
            end_time: newEndTime
          };

          if (newTechId) {
            updateData.assigned_technician = newTechId;
          }

          const { error } = await supabase
            .from('appointments')
            .update(updateData)
            .eq('id', appointment.id);

          if (error) throw error;
        }

        await loadAppointments();
      } catch (error) {
        console.error('Error rescheduling:', error);
        alert('Failed to reschedule. Please try again.');
      } finally {
        setDraggedItem(null);
        setDropTarget(null);
        setConflictWarning(null);
      }
    };

    setConfirmModal({
      title: 'Reschedule Appointment',
      message: confirmMessage,
      onConfirm: () => doTimeDrop()
    });
  }

  async function checkForConflicts(date: string, startTime: string, endTime: string, technicianId: string, excludeId?: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, title, start_time, end_time')
        .eq('appointment_date', date)
        .eq('assigned_technician', technicianId)
        .neq('status', 'cancelled');

      if (error) throw error;

      const conflicts = (data || []).filter(apt => {
        if (excludeId && apt.id === excludeId) return false;

        const aptStart = apt.start_time;
        const aptEnd = apt.end_time;

        // Check if times overlap
        return (
          (startTime >= aptStart && startTime < aptEnd) ||
          (endTime > aptStart && endTime <= aptEnd) ||
          (startTime <= aptStart && endTime >= aptEnd)
        );
      });

      if (conflicts.length > 0) {
        setConflictWarning(`Technician already has ${conflicts.length} appointment(s) at this time`);
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
    setLoading(true);
    try {
      let startDate: Date;
      let endDate: Date;

      if (viewMode === 'month') {
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      } else if (viewMode === 'week') {
        const day = currentDate.getDay();
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - day);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
      } else {
        startDate = new Date(currentDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(currentDate);
        endDate.setHours(23, 59, 59, 999);
      }

      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Load appointments using privacy-aware function, work orders, reminders, and scheduled connections
      const [appointmentsRes, workOrdersRes, tasksRes, leadsRes, discussionsRes, scheduledConnectionsRes] = await Promise.all([
        supabase.rpc('get_appointments_with_privacy', {
          p_user_id: user.id,
          p_company_id: user.id,
          p_start_date: startDate.toISOString().split('T')[0],
          p_end_date: endDate.toISOString().split('T')[0]
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
          .gte('scheduled_date', startDate.toISOString().split('T')[0])
          .lte('scheduled_date', endDate.toISOString().split('T')[0])
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
          .gte('reminder_date', startDate.toISOString())
          .lte('reminder_date', endDate.toISOString()),
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
          .gte('reminder_date', startDate.toISOString())
          .lte('reminder_date', endDate.toISOString()),
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
          .gte('reminder_date', startDate.toISOString())
          .lte('reminder_date', endDate.toISOString()),
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
          .gte('occurrence_date', startDate.toISOString().split('T')[0])
          .lte('occurrence_date', endDate.toISOString().split('T')[0])
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
          appointment_date: reminderDate.toISOString().split('T')[0],
          start_time: reminderDate.toTimeString().slice(0, 5),
          end_time: reminderDate.toTimeString().slice(0, 5),
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
          appointment_date: reminderDate.toISOString().split('T')[0],
          start_time: reminderDate.toTimeString().slice(0, 5),
          end_time: reminderDate.toTimeString().slice(0, 5),
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
          appointment_date: reminderDate.toISOString().split('T')[0],
          start_time: reminderDate.toTimeString().slice(0, 5),
          end_time: reminderDate.toTimeString().slice(0, 5),
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

      // Combine and sort by date and time
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

      setAllAppointments(combined);
    } catch (error) {
      console.error('Error loading calendar items:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadAgendaAppointments() {
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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Load appointments using privacy-aware function, work orders, reminders, and scheduled connections
      const [appointmentsRes, workOrdersRes, tasksRes, leadsRes, discussionsRes, scheduledConnectionsRes] = await Promise.all([
        supabase.rpc('get_appointments_with_privacy', {
          p_user_id: user.id,
          p_company_id: user.id,
          p_start_date: startDate.toISOString().split('T')[0],
          p_end_date: endDate.toISOString().split('T')[0]
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
          .gte('scheduled_date', startDate.toISOString().split('T')[0])
          .lte('scheduled_date', endDate.toISOString().split('T')[0])
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
          .gte('reminder_date', startDate.toISOString())
          .lte('reminder_date', endDate.toISOString()),
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
          .gte('reminder_date', startDate.toISOString())
          .lte('reminder_date', endDate.toISOString()),
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
          .gte('reminder_date', startDate.toISOString())
          .lte('reminder_date', endDate.toISOString()),
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
          .gte('occurrence_date', startDate.toISOString().split('T')[0])
          .lte('occurrence_date', endDate.toISOString().split('T')[0])
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
          appointment_date: reminderDate.toISOString().split('T')[0],
          start_time: reminderDate.toTimeString().slice(0, 5),
          end_time: reminderDate.toTimeString().slice(0, 5),
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
          appointment_date: reminderDate.toISOString().split('T')[0],
          start_time: reminderDate.toTimeString().slice(0, 5),
          end_time: reminderDate.toTimeString().slice(0, 5),
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
          appointment_date: reminderDate.toISOString().split('T')[0],
          start_time: reminderDate.toTimeString().slice(0, 5),
          end_time: reminderDate.toTimeString().slice(0, 5),
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

      setAllAppointments(combined);
    } catch (error) {
      console.error('Error loading agenda appointments:', error);
    } finally {
      setLoading(false);
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
    } else if (viewMode === 'week') {
      newDate.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setDate(currentDate.getDate() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
  }

  function getMonthDays() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days: Date[] = [];
    const current = new Date(startDate);

    while (days.length < 42) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  function getWeekDays() {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push(day);
    }

    return days;
  }

  function getAppointmentsForDate(date: Date): Appointment[] {
    const dateStr = date.toISOString().split('T')[0];
    return appointments.filter(apt => apt.appointment_date === dateStr);
  }

  function openCreateModal(date?: Date, time?: string) {
    if (date) {
      setSelectedDate(date.toISOString().split('T')[0]);
    } else {
      setSelectedDate(null);
    }
    setSelectedTime(time || null);
    setShowCreateModal(true);
  }

  function getDragSelectedSlots(): string[] {
    if (!dragSelectStart || !dragSelectEnd) return [];
    const slots = generateTimeSlots();
    const startIdx = slots.indexOf(dragSelectStart);
    const endIdx = slots.indexOf(dragSelectEnd);
    if (startIdx === -1 || endIdx === -1) return [];
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    return slots.slice(lo, hi + 1);
  }

  function commitDragSelection() {
    if (!dragSelectStart || !dragSelectEnd) {
      setIsDragSelecting(false);
      setDragSelectStart(null);
      setDragSelectEnd(null);
      return;
    }
    const slots = generateTimeSlots();
    const startIdx = slots.indexOf(dragSelectStart);
    const endIdx = slots.indexOf(dragSelectEnd);
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const startTime = slots[lo];
    const [endH, endM] = slots[hi].split(':').map(Number);
    const endMinutes = endH * 60 + endM + 30;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;
    setIsDragSelecting(false);
    setDragSelectStart(null);
    setDragSelectEnd(null);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
    setSelectedTime(startTime);
    setShowCreateModal(true);
    // Pass end time via selectedEndTime
    setSelectedEndTime(endTime);
  }

  async function handleDrop(targetDate: Date) {
    if (!draggedAppointment) return;

    const newDateStr = targetDate.toISOString().split('T')[0];
    if (newDateStr === draggedAppointment.appointment_date) {
      setDraggedAppointment(null);
      setDragOverDate(null);
      return;
    }

    const oldDateFormatted = new Date(draggedAppointment.appointment_date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    const newDateFormatted = targetDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const dropMessage =
      `Reschedule "${draggedAppointment.title}"?\n\n` +
      `From: ${oldDateFormatted}\n` +
      `To: ${newDateFormatted}\n` +
      `Time: ${draggedAppointment.start_time.slice(0, 5)}\n\n` +
      `Do you want to proceed?`;

    const doDrop = async () => {
      const hasConflict = await checkForConflicts(
        newDateStr,
        draggedAppointment.start_time,
        draggedAppointment.end_time,
        draggedAppointment.technician_id || '',
        draggedAppointment.id
      );

      if (hasConflict) {
        setConfirmModal({
          title: 'Scheduling Conflict',
          message: `⚠️ SCHEDULING CONFLICT\n\n${conflictWarning}\n\nDo you still want to reschedule?`,
          onConfirm: () => doDropForce()
        });
        return;
      }

      await doDropForce();
    };

    const doDropForce = async () => {
      try {
        const { error } = await supabase
          .from('appointments')
          .update({ appointment_date: newDateStr })
          .eq('id', draggedAppointment.id);

        if (error) throw error;

        await loadAppointments();
      } catch (error) {
        console.error('Error rescheduling appointment:', error);
        alert('Failed to reschedule appointment');
      } finally {
        setDraggedAppointment(null);
        setDragOverDate(null);
        setConflictWarning(null);
      }
    };

    setConfirmModal({
      title: 'Reschedule Appointment',
      message: dropMessage,
      onConfirm: () => doDrop()
    });
  }

  function handlePopOut() {
    // Build URL with current calendar state
    const params = new URLSearchParams({
      view: calendarView,
      viewMode,
      date: currentDate.toISOString(),
      calendarId: selectedCalendarId || '',
      popup: 'true'
    });

    // Open in new window
    const width = window.screen.width;
    const height = window.screen.height;
    const popupWindow = window.open(
      `/calendar?${params.toString()}`,
      'CalendarPopout',
      `width=${width},height=${height},left=0,top=0,menubar=no,toolbar=no,location=no,status=no`
    );

    if (popupWindow) {
      popupWindow.focus();
    }
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
        const cutoffDate = apt?.appointment_date || new Date().toISOString().split('T')[0];
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
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Loading calendar...</p>
        </div>
      </div>
    );
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

  return (
    <div className="space-y-6">
      {/* Header: two rows */}
      <div className="space-y-3">
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
            {viewMode !== 'agenda' && (
              <>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => navigateDate('prev')}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => navigateDate('next')}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </div>
                <span className="text-sm sm:text-base font-medium text-white whitespace-nowrap">{formatDateHeader()}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-0.5 bg-white/10 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('month')}
                className={`px-2.5 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-white hover:bg-white/10'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-2.5 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-white hover:bg-white/10'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode('day')}
                className={`px-2.5 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'day' ? 'bg-white text-gray-900 shadow-sm' : 'text-white hover:bg-white/10'
                }`}
              >
                Day
              </button>
              {(calendarView === 'my' || calendarView === 'shared') && (
                <button
                  onClick={() => setViewMode('agenda')}
                  className={`px-2.5 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                    viewMode === 'agenda' ? 'bg-white text-gray-900 shadow-sm' : 'text-white hover:bg-white/10'
                  }`}
                >
                  Agenda
                </button>
              )}
            </div>

            {/* Technician sub-view toggle */}
            {calendarView === 'technicians' && viewMode === 'day' && (
              <div className="flex items-center gap-0.5 bg-white/10 rounded-lg p-0.5">
                <button
                  onClick={() => setTechnicianViewMode('timeline')}
                  className={`px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    technicianViewMode === 'timeline' ? 'bg-white text-gray-900 shadow-sm' : 'text-white hover:bg-white/10'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Timeline</span>
                </button>
                <button
                  onClick={() => setTechnicianViewMode('list')}
                  className={`px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    technicianViewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-white hover:bg-white/10'
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">List</span>
                </button>
              </div>
            )}

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

            {/* Pop-out */}
            <button
              onClick={handlePopOut}
              className="p-2 bg-white/10 text-white hover:bg-white/20 rounded-lg transition-colors"
              title="Pop out calendar in new window"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Add Event */}
            <button
              onClick={() => openCreateModal()}
              className="px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New+</span>
            </button>
          </div>
        </div>

        {/* Row 2: Calendar Tab Rail */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <CalendarTab
            label="My Calendar"
            icon={<User className="w-3.5 h-3.5" />}
            color={null}
            isActive={activeTabKey === 'my'}
            isDefault={currentDefault === 'my'}
            onSelect={() => handleTabSelect('my')}
            onSetDefault={() => saveDefaultCalendarView('my')}
            savingDefault={savingDefault}
          />
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
        </div>
      </div>

      {/* Technician Calendar Views */}
      {calendarView === 'technicians' && viewMode === 'day' && (
        <>
          {/* Stats Overview - Only show in Day view */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-8 h-8 opacity-80" />
                <span className="text-2xl font-bold">{technicians.length}</span>
              </div>
              <div className="text-sm opacity-90">Active Technicians</div>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between mb-2">
                <Wrench className="w-8 h-8 opacity-80" />
                <span className="text-2xl font-bold">{technicianStats.reduce((sum, s) => sum + s.work_orders, 0)}</span>
              </div>
              <div className="text-sm opacity-90">Work Orders</div>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-8 h-8 opacity-80" />
                <span className="text-2xl font-bold">{technicianStats.reduce((sum, s) => sum + s.in_progress, 0)}</span>
              </div>
              <div className="text-sm opacity-90">In Progress</div>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle2 className="w-8 h-8 opacity-80" />
                <span className="text-2xl font-bold">{technicianStats.reduce((sum, s) => sum + s.completed, 0)}</span>
              </div>
              <div className="text-sm opacity-90">Completed</div>
            </div>
          </div>

          {/* Timeline View - Vertical Layout */}
          {technicianViewMode === 'timeline' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-auto max-h-[800px]">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 border-b-2 border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="sticky left-0 z-20 bg-gray-50 px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r-2 border-gray-300 w-20">
                        Time
                      </th>
                      {technicians.map(tech => {
                        const stats = technicianStats.find(s => s.technician_id === tech.id);
                        return (
                          <th key={tech.id} className="px-3 py-3 text-center text-sm font-semibold text-gray-900 border-r border-gray-200 min-w-48">
                            <div>{tech.full_name}</div>
                            <div className="text-xs text-gray-500 font-normal capitalize">{tech.role}</div>
                            <div className="flex items-center justify-center gap-2 mt-1">
                              <span className="text-xs text-gray-600">
                                {stats?.total_items || 0} items
                              </span>
                              {stats && stats.in_progress > 0 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                                  {stats.in_progress}
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {generateTimeSlots().map(timeSlot => {
                      return (
                        <tr key={timeSlot} className="hover:bg-gray-50">
                          <td className="sticky left-0 z-10 bg-white px-4 py-6 border-r-2 border-gray-300 text-sm font-medium text-gray-700">
                            {timeSlot}
                          </td>
                          {technicians.map(tech => {
                            const appointment = getAppointmentForTimeSlot(tech.id, timeSlot);
                            const isDropTarget = dropTarget?.techId === tech.id && dropTarget?.time === timeSlot;

                            return (
                              <td
                                key={tech.id}
                                className={`px-2 py-2 border-r border-gray-200 relative cursor-pointer hover:bg-gray-50 ${
                                  isDropTarget ? 'bg-blue-100' : ''
                                }`}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  if (draggedItem && (!appointment || appointment.id !== draggedItem.appointment.id)) {
                                    setDropTarget({ techId: tech.id, time: timeSlot });
                                  }
                                }}
                                onDragLeave={() => {
                                  setDropTarget(null);
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  if (draggedItem) {
                                    handleTimeDrop(draggedItem.appointment, timeSlot, tech.id);
                                  }
                                }}
                                onClick={() => {
                                  if (!appointment) {
                                    openCreateModal(currentDate, timeSlot);
                                  }
                                }}
                                title={!appointment ? `Click to schedule at ${timeSlot}` : ''}
                              >
                                {appointment ? (
                                  <div
                                    draggable={!appointment.isReminder && appointment.status !== 'completed'}
                                    onDragStart={() => {
                                      if (!appointment.isReminder && appointment.status !== 'completed') {
                                        setDraggedItem({ appointment, sourceTime: timeSlot });
                                      }
                                    }}
                                    onDragEnd={() => {
                                      setDraggedItem(null);
                                      setDropTarget(null);
                                    }}
                                    className={`cursor-move rounded px-2 py-2 text-xs font-medium shadow-sm ${
                                      appointment.status === 'completed'
                                        ? 'bg-green-100 text-green-800 border border-green-300 cursor-not-allowed'
                                        : appointment.status === 'in_progress' || appointment.status === 'on_my_way'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                        : appointment.isWorkOrder
                                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                        : appointment.isReminder
                                        ? 'bg-gray-100 text-gray-700 border border-gray-300 cursor-not-allowed'
                                        : 'bg-purple-100 text-purple-800 border border-purple-300'
                                    }`}
                                    title={`${appointment.title}\n${appointment.customer_name}\n${appointment.start_time.slice(0, 5)} - ${appointment.end_time.slice(0, 5)}\nStatus: ${appointment.status}\n${appointment.isReminder ? 'Cannot drag reminders' : appointment.status === 'completed' ? 'Cannot drag completed items' : 'Drag to reschedule'}`}
                                  >
                                    <div className="flex items-center gap-1 whitespace-nowrap overflow-hidden">
                                      {appointment.isWorkOrder && <Wrench className="w-3 h-3 flex-shrink-0" />}
                                      <span className="truncate">
                                        {appointment.title.length > 8 ? appointment.title.slice(0, 8) + '...' : appointment.title}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-8"></div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
                <p className="text-xs text-gray-600">
                  <strong>Tip:</strong> Drag and drop appointments or work orders to reschedule them to a different time or reassign to another technician.
                  Completed items and reminders cannot be moved.
                </p>
              </div>
            </div>
          )}

          {/* List View */}
          {technicianViewMode === 'list' && (
            <div className="space-y-4">
              {technicians.map(tech => {
                const stats = technicianStats.find(s => s.technician_id === tech.id);
                const techAppts = getTechnicianAppointments(tech.id);

                return (
                  <div key={tech.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{tech.full_name}</h3>
                          <p className="text-sm text-gray-600 capitalize">{tech.role}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-900">{stats?.total_items || 0}</div>
                            <div className="text-xs text-gray-500">Total Items</div>
                          </div>
                          <div className="h-10 w-px bg-gray-300"></div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{stats?.completed || 0}</div>
                            <div className="text-xs text-gray-500">Completed</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-amber-600">{stats?.in_progress || 0}</div>
                            <div className="text-xs text-gray-500">In Progress</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      {techAppts.length === 0 ? (
                        <div className="text-center py-8">
                          <CalendarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500">No scheduled items for this period</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {techAppts.map(apt => (
                            <div
                              key={apt.id}
                              className={`flex items-center gap-4 p-4 rounded-lg border-2 ${
                                apt.status === 'completed'
                                  ? 'bg-green-50 border-green-200'
                                  : apt.status === 'in_progress' || apt.status === 'on_my_way'
                                  ? 'bg-amber-50 border-amber-200'
                                  : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex-shrink-0">
                                {apt.isWorkOrder ? (
                                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                                    <Wrench className="w-5 h-5 text-white" />
                                  </div>
                                ) : apt.isReminder ? (
                                  <div className="w-10 h-10 bg-gray-500 rounded-lg flex items-center justify-center">
                                    <AlertCircle className="w-5 h-5 text-white" />
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                                    <CalendarIcon className="w-5 h-5 text-white" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold text-gray-900">{apt.title}</h4>
                                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                    apt.status === 'completed'
                                      ? 'bg-green-100 text-green-700'
                                      : apt.status === 'in_progress' || apt.status === 'on_my_way'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}>
                                    {apt.status.replace('_', ' ')}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">{apt.customer_name}</p>
                              </div>
                              <div className="flex-shrink-0 text-right">
                                <div className="text-lg font-semibold text-gray-900">
                                  {apt.start_time.slice(0, 5)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(apt.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Shared Month View - Works for both My Calendar and Technician Calendar */}
      {viewMode === 'month' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="px-3 py-2 text-sm font-medium text-gray-700 text-center">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {getMonthDays().map((date, index) => {
              const isCurrentMonth = date.getMonth() === currentDate.getMonth();
              const isToday = date.toDateString() === new Date().toDateString();
              const dayAppointments = getAppointmentsForDate(date);

              return (
                <div
                  key={index}
                  ref={isToday ? todayRef : null}
                  className={`min-h-28 p-2 border-b border-r border-gray-200 transition-colors ${
                    !isCurrentMonth ? 'bg-gray-50' : ''
                  } ${isToday ? 'bg-blue-50' : ''} ${
                    dragOverDate === date.toISOString().split('T')[0] ? 'bg-green-100 ring-2 ring-green-400' : ''
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverDate(date.toISOString().split('T')[0]);
                  }}
                  onDragLeave={() => setDragOverDate(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(date);
                  }}
                  onDoubleClick={() => openCreateModal(date)}
                >
                  <div
                    className={`text-sm font-medium mb-1 cursor-pointer hover:underline ${
                      isToday ? 'text-blue-600' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openCreateModal(date);
                    }}
                    title="Click to add event on this date"
                  >
                    {date.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayAppointments.slice(0, 3).map((apt) => (
                      <div
                        key={apt.id}
                        draggable={!apt.isWorkOrder && !apt.isReminder && apt.status !== 'completed' && apt.status !== 'cancelled'}
                        onDragStart={(e) => {
                          if (!apt.isWorkOrder && !apt.isReminder) {
                            setDraggedAppointment(apt);
                            e.dataTransfer.effectAllowed = 'move';
                          }
                        }}
                        onDragEnd={() => {
                          setDraggedAppointment(null);
                          setDragOverDate(null);
                        }}
                        className={`text-xs p-1 rounded truncate ${
                          apt.isWorkOrder || apt.isReminder ? 'cursor-default' : 'cursor-move'
                        } ${
                          apt.status === 'completed'
                            ? 'bg-green-100 text-green-800 cursor-default'
                            : apt.status === 'cancelled'
                            ? 'bg-gray-100 text-gray-600 cursor-default'
                            : apt.isReminder
                            ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                            : apt.isWorkOrder
                            ? 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                            : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                        } ${draggedAppointment?.id === apt.id ? 'opacity-50' : ''}`}
                        title={`${apt.title}${apt.isReminder ? ` (${apt.reminderType} reminder)` : apt.isWorkOrder ? ' (Work Order)' : ` - ${apt.customer_name}`}${isRecurring(apt) ? ' (Recurring)' : ''}`}
                      >
                        <span className="flex items-center gap-0.5 truncate">
                          {isRecurring(apt) && <Repeat className="w-2.5 h-2.5 flex-shrink-0 opacity-70" />}
                          {apt.start_time.slice(0, 5)} {apt.title}
                        </span>
                      </div>
                    ))}
                    {dayAppointments.length > 3 && (
                      <div className="text-xs text-gray-500 pl-1">
                        +{dayAppointments.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View - Works for both My Calendar and Technician Calendar */}
      {viewMode === 'week' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
          <div className="grid grid-cols-7 border-b border-gray-200 min-w-[560px]">
            {getWeekDays().map((date, index) => {
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <div key={index} className={`px-3 py-2 text-center border-r border-gray-200 last:border-r-0 ${isToday ? 'bg-blue-50' : ''}`}>
                  <div className="text-xs text-gray-500">
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className={`text-lg font-semibold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                    {date.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7 min-w-[560px]">
            {getWeekDays().map((date, index) => {
              const isToday = date.toDateString() === new Date().toDateString();
              const dayAppointments = getAppointmentsForDate(date);

              return (
                <div
                  key={index}
                  className={`min-h-96 p-3 border-r border-gray-200 last:border-r-0 cursor-pointer hover:bg-gray-50 ${
                    isToday ? 'bg-blue-50/30' : ''
                  } ${dragOverDate === date.toISOString().split('T')[0] ? 'bg-green-100 ring-2 ring-green-400' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverDate(date.toISOString().split('T')[0]);
                  }}
                  onDragLeave={() => setDragOverDate(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(date);
                  }}
                  onDoubleClick={() => openCreateModal(date)}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('.space-y-2') === e.currentTarget.querySelector('.space-y-2')) {
                      openCreateModal(date);
                    }
                  }}
                  title="Double-click to add event"
                >
                  <div className="space-y-2">
                    {dayAppointments.map((apt) => (
                      <div
                        key={apt.id}
                        draggable={!apt.isWorkOrder && !apt.isReminder && apt.status !== 'completed' && apt.status !== 'cancelled'}
                        onDragStart={(e) => {
                          if (!apt.isWorkOrder && !apt.isReminder) {
                            setDraggedAppointment(apt);
                            e.dataTransfer.effectAllowed = 'move';
                          }
                        }}
                        onDragEnd={() => {
                          setDraggedAppointment(null);
                          setDragOverDate(null);
                        }}
                        className={`p-2 rounded text-xs ${
                          apt.isWorkOrder || apt.isReminder ? 'cursor-default' : 'cursor-move'
                        } ${
                          apt.status === 'completed'
                            ? 'bg-green-100 text-green-800 cursor-default'
                            : apt.status === 'cancelled'
                            ? 'bg-gray-100 text-gray-600 cursor-default'
                            : apt.is_blocked
                            ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            : apt.isReminder
                            ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                            : apt.isWorkOrder
                            ? 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                            : apt.appointment_type === 'personal'
                            ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
                            : apt.appointment_type === 'work_order'
                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                        } ${draggedAppointment?.id === apt.id ? 'opacity-50' : ''}`}
                      >
                        <div className="font-semibold flex items-center gap-1">
                          {apt.appointment_type === 'personal' && !apt.is_blocked && (
                            <User className="w-3 h-3 flex-shrink-0" />
                          )}
                          {apt.appointment_type === 'customer_meeting' && !apt.is_blocked && (
                            <Users className="w-3 h-3 flex-shrink-0" />
                          )}
                          {apt.is_private && !apt.is_blocked && (
                            <Lock className="w-3 h-3 flex-shrink-0" />
                          )}
                          {isRecurring(apt) && (
                            <Repeat className="w-3 h-3 flex-shrink-0 opacity-70" />
                          )}
                          <span>{apt.start_time.slice(0, 5)}</span>
                        </div>
                        <div className="truncate">{apt.title}</div>
                        {apt.customer_name && (
                          <div className="text-gray-600 truncate">{apt.customer_name}</div>
                        )}
                        {apt.technician_name && (
                          <div className="text-gray-500 truncate text-xs">{apt.technician_name}</div>
                        )}
                      </div>
                    ))}
                    {dayAppointments.length === 0 && (
                      <div className="text-xs text-gray-400 text-center py-8">No items</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day Schedule View - Timeline with time slots */}
      {viewMode === 'day' && (calendarView === 'my' || calendarView === 'shared' || (calendarView === 'technicians' && technicianViewMode === 'list')) && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Date Header */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 md:px-6 py-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl md:text-2xl font-bold">
                  {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
                </h2>
                <p className="text-sm md:text-base text-blue-100">
                  {currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl md:text-3xl font-bold">{appointments.length}</div>
                <div className="text-xs md:text-sm text-blue-100">
                  {appointments.length === 1 ? 'Event' : 'Events'}
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div
            className="overflow-auto max-h-[700px]"
            onMouseLeave={() => {
              if (isDragSelecting) {
                commitDragSelection();
              }
            }}
          >
            {appointments.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <CalendarIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No scheduled items for this day</p>
                <p className="text-xs text-gray-400 mt-1">Click a time slot or drag to select a range</p>
                <button
                  onClick={() => openCreateModal(currentDate)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New+
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 select-none">
                {generateTimeSlots().map(timeSlot => {
                  const slotAppointments = getAppointmentsForTimeSlot(timeSlot);
                  const currentTime = new Date();
                  const currentHour = currentTime.getHours();
                  const slotHour = parseInt(timeSlot.split(':')[0]);
                  const isCurrentHour = currentDate.toDateString() === currentTime.toDateString() && currentHour === slotHour;
                  const isDragSelected = getDragSelectedSlots().includes(timeSlot);

                  return (
                    <div
                      key={timeSlot}
                      className={`flex flex-col sm:flex-row transition-colors ${
                        isDragSelected ? 'bg-blue-100' : isCurrentHour ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Time Column */}
                      <div className={`flex-shrink-0 w-full sm:w-24 md:w-32 px-3 md:px-4 py-3 md:py-4 border-r border-gray-200 ${
                        isDragSelected ? 'bg-blue-200' : isCurrentHour ? 'bg-blue-100' : 'bg-gray-50'
                      }`}>
                        <div className={`text-sm md:text-base font-semibold ${
                          isDragSelected ? 'text-blue-700' : isCurrentHour ? 'text-blue-700' : 'text-gray-700'
                        }`}>
                          {timeSlot}
                        </div>
                        <div className="text-xs text-gray-500 hidden md:block">
                          {new Date(`2000-01-01T${timeSlot}`).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </div>
                      </div>

                      {/* Appointments Column */}
                      <div
                        className={`flex-1 min-h-[80px] p-3 md:p-4 ${isDragSelecting ? 'cursor-ns-resize' : 'cursor-pointer'}`}
                        onMouseDown={() => {
                          if (slotAppointments.length === 0) {
                            setIsDragSelecting(true);
                            setDragSelectStart(timeSlot);
                            setDragSelectEnd(timeSlot);
                          }
                        }}
                        onMouseEnter={() => {
                          if (isDragSelecting) {
                            setDragSelectEnd(timeSlot);
                          }
                        }}
                        onMouseUp={() => {
                          if (isDragSelecting) {
                            if (dragSelectStart === dragSelectEnd) {
                              setIsDragSelecting(false);
                              setDragSelectStart(null);
                              setDragSelectEnd(null);
                              openCreateModal(currentDate, timeSlot);
                            } else {
                              commitDragSelection();
                            }
                          }
                        }}
                        onClick={() => {
                          if (!isDragSelecting && slotAppointments.length === 0) {
                            openCreateModal(currentDate, timeSlot);
                          }
                        }}
                        title={slotAppointments.length === 0 ? `Click to schedule at ${timeSlot}` : ''}
                      >
                        {slotAppointments.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                            <Plus className="w-4 h-4 mr-1" />
                            <span className="hidden sm:inline">Click to schedule</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {slotAppointments.map(apt => (
                              <div
                                key={apt.id}
                                onClick={(e) => e.stopPropagation()}
                                className={`p-3 rounded-lg border-2 transition-all ${
                                  apt.status === 'completed'
                                    ? 'bg-green-50 border-green-300'
                                    : apt.status === 'in_progress' || apt.status === 'on_my_way'
                                    ? 'bg-amber-50 border-amber-300'
                                    : apt.status === 'cancelled'
                                    ? 'bg-gray-100 border-gray-300'
                                    : apt.is_blocked
                                    ? 'bg-gray-200 border-gray-400'
                                    : apt.appointment_type === 'personal'
                                    ? 'bg-indigo-50 border-indigo-300'
                                    : apt.appointment_type === 'work_order'
                                    ? 'bg-orange-50 border-orange-300'
                                    : apt.isWorkOrder
                                    ? 'bg-blue-50 border-blue-300'
                                    : apt.isReminder
                                    ? 'bg-purple-50 border-purple-300'
                                    : 'bg-blue-50 border-blue-300'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <h3 className="font-semibold text-gray-900 text-sm md:text-base">
                                        {apt.title}
                                      </h3>
                                      {apt.appointment_type === 'personal' && !apt.is_blocked && (
                                        <User className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                      )}
                                      {apt.appointment_type === 'customer_meeting' && !apt.is_blocked && (
                                        <Users className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                      )}
                                      {apt.is_private && !apt.is_blocked && (
                                        <Lock className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                      )}
                                      {isRecurring(apt) && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                          <Repeat className="w-3 h-3" />
                                          Recurring
                                        </span>
                                      )}
                                      {apt.isWorkOrder && (
                                        <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 rounded">
                                          Work Order
                                        </span>
                                      )}
                                      {apt.isReminder && (
                                        <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 rounded capitalize">
                                          {apt.reminderType} Reminder
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600 mb-1">
                                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                      <span>{apt.start_time.slice(0, 5)} - {apt.end_time.slice(0, 5)}</span>
                                    </div>
                                    {apt.customer_name && (
                                      <p className="text-xs md:text-sm text-gray-600 truncate">
                                        {apt.customer_name}
                                      </p>
                                    )}
                                    {calendarView === 'technicians' && apt.technician_name && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        {apt.isReminder ? 'Assigned to' : 'Technician'}: {apt.technician_name}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                    <StatusBadge status={apt.status} />
                                    {!apt.isWorkOrder && !apt.isReminder && apt.status !== 'completed' && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          requestDeleteAppointment(apt);
                                        }}
                                        className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors border border-red-200"
                                        title="Delete appointment"
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Tip */}
          {appointments.length > 0 && (
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
              <p className="text-xs text-gray-600">
                <strong>Tip:</strong> Click on empty time slots to quickly schedule an event.
              </p>
            </div>
          )}
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
                    New+
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
                                  {apt.title}
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
                                        setCurrentDate(new Date(apt.appointment_date));
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
          calendarContext={calendarView}
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
