import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getTechColor } from '../../lib/techColors';
import { CreateAppointmentModal } from '../Appointments/CreateAppointmentModal';
import {
  rescheduleWorkOrder,
  rescheduleAppointment,
  scheduleUnscheduledWorkOrder,
  checkPtoConflict,
  formatTime12,
  toMinutes,
  type ConflictInfo,
} from '../../lib/scheduling';
import {
  ChevronLeft,
  ChevronRight,
  User,
  Wrench,
  AlertTriangle,
  Calendar,
  Filter,
  X,
  GripVertical,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { resolveWorkOrderDurationMinutes } from '../../lib/scheduling';

interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  type: 'work_order' | 'appointment';
  status: string;
  technician_id: string;
  customer_name?: string;
  priority?: string;
  work_order_number?: string;
}

interface Technician {
  id: string;
  full_name: string;
  role: string;
}

interface UnscheduledWorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  priority: string;
  estimated_hours: number;
  assigned_to: string | null;
  assigned_tech_name: string | null;
  customer_name: string | null;
  project_name: string | null;
}

interface TimeOffEntry {
  user_id: string;
  start_date: string;
  end_date: string;
}

interface ConfirmState {
  message: string;
  onConfirm: () => void;
}

interface EventPopover {
  event: ScheduleEvent;
  x: number;
  y: number;
}

const HOUR_START = 6;
const HOUR_END = 21;
const TOTAL_HOURS = HOUR_END - HOUR_START;
const SLOT_HEIGHT = 56;

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high': return 'border-l-red-500';
    case 'medium': return 'border-l-amber-500';
    case 'low': return 'border-l-blue-500';
    default: return 'border-l-gray-500';
  }
}

function getPriorityBadge(priority: string): string {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-700';
    case 'medium': return 'bg-amber-100 text-amber-700';
    case 'low': return 'bg-blue-100 text-blue-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function padTime(h: number, m: number): string {
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function ResourceDayView({ onNavigate }: { onNavigate?: (tab: string, params?: Record<string, string>) => void }) {
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [unscheduled, setUnscheduled] = useState<UnscheduledWorkOrder[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffEntry[]>([]);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hiddenTechs, setHiddenTechs] = useState<Set<string>>(new Set());
  const [showTechFilter, setShowTechFilter] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState<ScheduleEvent | null>(null);
  const [draggedUnscheduled, setDraggedUnscheduled] = useState<UnscheduledWorkOrder | null>(null);
  const [dropTarget, setDropTarget] = useState<{ techId: string; minutes: number } | null>(null);
  const [conflictAtTarget, setConflictAtTarget] = useState(false);
  const [ptoConflictAtTarget, setPtoConflictAtTarget] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalProps, setCreateModalProps] = useState<{ date?: string; time?: string; techId?: string }>({});
  const [confirmAction, setConfirmAction] = useState<ConfirmState | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [savingEventId, setSavingEventId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [eventPopover, setEventPopover] = useState<EventPopover | null>(null);
  const [rescheduleModal, setRescheduleModal] = useState<{ event: ScheduleEvent } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceUnschedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = new Date();
  const ds = dateStr(anchor);

  const visibleTechs = techs.filter(t => !hiddenTechs.has(t.id));

  const scrollToCurrentTime = useCallback(() => {
    if (scrollRef.current) {
      const nowHour = today.getHours();
      const clampedHour = Math.max(HOUR_START, Math.min(HOUR_END - 1, nowHour - 1));
      scrollRef.current.scrollTop = (clampedHour - HOUR_START) * SLOT_HEIGHT;
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadTechnicians();
  }, []);

  useEffect(() => {
    loadData();
    loadUnscheduled();
  }, [anchor, techs]);

  useEffect(() => {
    scrollToCurrentTime();
  }, [scrollToCurrentTime]);

  useEffect(() => {
    const channel = supabase
      .channel('resource-day-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => loadData(), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => loadData(), 500);
        if (debounceUnschedRef.current) clearTimeout(debounceUnschedRef.current);
        debounceUnschedRef.current = setTimeout(() => loadUnscheduled(), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pto_requests' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => loadData(), 500);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (debounceUnschedRef.current) clearTimeout(debounceUnschedRef.current);
    };
  }, [anchor, techs]);

  async function loadTechnicians() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_active', true)
        .in('role', ['tech', 'lead_tech'])
        .order('full_name');

      if (error) throw error;
      setTechs(data || []);
    } catch (e) {
      console.error('Error loading technicians:', e);
    }
  }

  async function loadData() {
    if (techs.length === 0) return;
    setLoading(true);
    try {
      const techIds = techs.map(t => t.id);
      const start = ds;
      const end = ds;

      const [woRes, aptRes, ptoRes] = await Promise.all([
        supabase.from('work_orders').select(`
          id, title, work_order_number, scheduled_date, scheduled_start_time, scheduled_end_time,
          estimated_hours, status, priority, assigned_to,
          contacts(full_name, company_name)
        `).in('assigned_to', techIds)
          .eq('scheduled_date', start)
          .not('status', 'in', '("completed","cancelled","archived")'),

        supabase.from('appointments').select(`
          id, title, appointment_date, start_time, end_time, status, assigned_technician,
          contacts(full_name, company_name)
        `).in('assigned_technician', techIds)
          .eq('appointment_date', start)
          .neq('status', 'cancelled'),

        supabase.from('pto_requests').select('employee_id, start_date, end_date, status')
          .in('employee_id', techIds).eq('status', 'approved')
          .lte('start_date', end).gte('end_date', start),
      ]);

      const woEvents: ScheduleEvent[] = (woRes.data || []).map((wo: any) => {
        const startT = wo.scheduled_start_time || '08:00';
        let endT = wo.scheduled_end_time;
        if (!endT) {
          const hours = wo.estimated_hours || 2;
          const endMin = toMinutes(startT) + hours * 60;
          endT = padTime(Math.floor(endMin / 60), endMin % 60);
        }
        return {
          id: wo.id,
          title: wo.title,
          date: wo.scheduled_date,
          start_time: startT,
          end_time: endT,
          type: 'work_order' as const,
          status: wo.status,
          technician_id: wo.assigned_to,
          customer_name: wo.contacts?.full_name || wo.contacts?.company_name || undefined,
          priority: wo.priority,
          work_order_number: wo.work_order_number,
        };
      });

      const aptEvents: ScheduleEvent[] = (aptRes.data || []).map((apt: any) => ({
        id: apt.id,
        title: apt.title,
        date: apt.appointment_date,
        start_time: apt.start_time || '09:00',
        end_time: apt.end_time || '10:00',
        type: 'appointment' as const,
        status: apt.status,
        technician_id: apt.assigned_technician,
        customer_name: apt.contacts?.full_name || apt.contacts?.company_name || undefined,
      }));

      setEvents([...woEvents, ...aptEvents]);
      setTimeOff((ptoRes.data || []).map((r: any) => ({ user_id: r.employee_id, start_date: r.start_date, end_date: r.end_date })));
    } catch (e) {
      console.error('Error loading schedule data:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadUnscheduled() {
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          id, work_order_number, title, priority, estimated_hours, assigned_to,
          project:projects(project_name),
          contact:contacts(full_name, company_name),
          assigned_tech:profiles!work_orders_assigned_to_fkey(full_name)
        `)
        .is('scheduled_date', null)
        .not('status', 'in', '("completed","cancelled","archived")')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const items: UnscheduledWorkOrder[] = (data || []).map((wo: any) => ({
        id: wo.id,
        work_order_number: wo.work_order_number,
        title: wo.title,
        priority: wo.priority,
        estimated_hours: wo.estimated_hours || 2,
        assigned_to: wo.assigned_to,
        assigned_tech_name: wo.assigned_tech?.full_name || null,
        customer_name: wo.contact?.full_name || wo.contact?.company_name || null,
        project_name: wo.project?.project_name || null,
      }));

      setUnscheduled(items);
    } catch (e) {
      console.error('Error loading unscheduled work orders:', e);
    }
  }

  function isTechOnTimeOff(techId: string): boolean {
    return timeOff.some(t => t.user_id === techId && ds >= t.start_date && ds <= t.end_date);
  }

  function getEventsForTech(techId: string): ScheduleEvent[] {
    return events.filter(e => e.technician_id === techId);
  }

  function getTechStatus(techId: string): 'off' | 'free' | 'light' | 'busy' {
    if (isTechOnTimeOff(techId)) return 'off';
    const count = getEventsForTech(techId).length;
    if (count === 0) return 'free';
    if (count <= 2) return 'light';
    return 'busy';
  }

  function eventTopPx(event: ScheduleEvent): number {
    const startMin = toMinutes(event.start_time) - HOUR_START * 60;
    return (startMin / (TOTAL_HOURS * 60)) * (TOTAL_HOURS * SLOT_HEIGHT);
  }

  function eventHeightPx(event: ScheduleEvent): number {
    const durMin = toMinutes(event.end_time) - toMinutes(event.start_time);
    return Math.max((durMin / 60) * SLOT_HEIGHT, 24);
  }

  function currentTimeTopPx(): number {
    const nowMin = currentTime.getHours() * 60 + currentTime.getMinutes() - HOUR_START * 60;
    return (nowMin / (TOTAL_HOURS * 60)) * (TOTAL_HOURS * SLOT_HEIGHT);
  }

  function checkConflict(techId: string, startMin: number, endMin: number, excludeId?: string): boolean {
    return events.some(e => {
      if (e.technician_id !== techId) return false;
      if (excludeId && e.id === excludeId) return false;
      const eStart = toMinutes(e.start_time);
      const eEnd = toMinutes(e.end_time);
      return startMin < eEnd && endMin > eStart;
    });
  }

  function navigate(dir: 1 | -1) {
    const d = new Date(anchor);
    d.setDate(d.getDate() + dir);
    setAnchor(d);
  }

  function handleSlotClick(techId: string, hour: number) {
    const time = padTime(hour, 0);
    setCreateModalProps({ date: ds, time, techId });
    setShowCreateModal(true);
  }

  function handleEventClick(e: React.MouseEvent, event: ScheduleEvent) {
    e.stopPropagation();
    if (event.type === 'work_order' && onNavigate) {
      onNavigate('work_orders', { workOrderId: event.id });
    } else {
      setEventPopover({ event, x: e.clientX, y: e.clientY });
    }
  }

  function getMinutesFromY(clientY: number, rect: DOMRect): number {
    const y = clientY - rect.top;
    const minutes = (y / (TOTAL_HOURS * SLOT_HEIGHT)) * (TOTAL_HOURS * 60) + HOUR_START * 60;
    return Math.max(HOUR_START * 60, Math.min(HOUR_END * 60, Math.round(minutes / 15) * 15));
  }

  function handleGridDragOver(e: React.DragEvent, techId: string) {
    if (!draggedEvent && !draggedUnscheduled) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const startMin = getMinutesFromY(e.clientY, rect);
    const duration = draggedEvent
      ? toMinutes(draggedEvent.end_time) - toMinutes(draggedEvent.start_time)
      : (draggedUnscheduled?.estimated_hours || 2) * 60;
    const endMin = Math.min(startMin + duration, HOUR_END * 60);

    const hasConflict = checkConflict(techId, startMin, endMin, draggedEvent?.id);
    const hasPto = isTechOnTimeOff(techId);
    setDropTarget({ techId, minutes: startMin });
    setConflictAtTarget(hasConflict);
    setPtoConflictAtTarget(hasPto);
  }

  async function handleGridDrop(e: React.DragEvent, techId: string) {
    e.preventDefault();
    if (!dropTarget || dropTarget.techId !== techId) return;

    const startMin = dropTarget.minutes;
    const newStart = padTime(Math.floor(startMin / 60), startMin % 60);
    const techName = techs.find(t => t.id === techId)?.full_name || 'Unknown';

    const buildConflictMessage = (): string => {
      const parts: string[] = [];
      if (conflictAtTarget) {
        parts.push(`Scheduling conflict at ${formatTime12(newStart)}. ${techName} already has something scheduled at this time.`);
      }
      if (ptoConflictAtTarget) {
        parts.push(`${techName} has approved PTO on this date.`);
      }
      return parts.join(' ') + ' Do you want to proceed?';
    };

    if (draggedEvent) {
      const duration = toMinutes(draggedEvent.end_time) - toMinutes(draggedEvent.start_time);
      const endMin = Math.min(startMin + duration, HOUR_END * 60);
      const newEnd = padTime(Math.floor(endMin / 60), endMin % 60);
      const isReassign = draggedEvent.technician_id !== techId;

      const doMoveNormal = async () => {
        setSavingEventId(draggedEvent.id);
        try {
          const result = draggedEvent.type === 'work_order'
            ? await rescheduleWorkOrder(
                draggedEvent.id, ds, newStart, newEnd,
                isReassign ? techId : undefined
              )
            : await rescheduleAppointment(
                draggedEvent.id, ds, newStart, newEnd,
                isReassign ? techId : undefined
              );

          if (!result.success && result.conflict) {
            setSavingEventId(null);
            setConfirmAction({
              message: buildConflictMessage(),
              onConfirm: () => doMoveForce(),
            });
            return;
          }
          if (!result.success) {
            setErrorMessage(result.error || 'Failed to reschedule. Please try again.');
          }
          await loadData();
        } catch (err) {
          console.error('Error moving event:', err);
          setErrorMessage('Failed to reschedule. Please try again.');
        } finally {
          setSavingEventId(null);
          if (!confirmAction) {
            setDraggedEvent(null);
            setDropTarget(null);
            setConflictAtTarget(false);
            setPtoConflictAtTarget(false);
          }
        }
      };

      const doMoveForce = async () => {
        setSavingEventId(draggedEvent.id);
        try {
          const result = draggedEvent.type === 'work_order'
            ? await rescheduleWorkOrder(
                draggedEvent.id, ds, newStart, newEnd,
                isReassign ? techId : undefined,
                { force: true }
              )
            : await rescheduleAppointment(
                draggedEvent.id, ds, newStart, newEnd,
                isReassign ? techId : undefined,
                { force: true }
              );

          if (!result.success) {
            setErrorMessage(result.error || 'Failed to reschedule. Please try again.');
          }
          await loadData();
        } catch (err) {
          console.error('Error moving event:', err);
          setErrorMessage('Failed to reschedule. Please try again.');
        } finally {
          setSavingEventId(null);
          setDraggedEvent(null);
          setDropTarget(null);
          setConflictAtTarget(false);
          setPtoConflictAtTarget(false);
          setConfirmAction(null);
        }
      };

      if (conflictAtTarget || ptoConflictAtTarget) {
        setConfirmAction({
          message: buildConflictMessage(),
          onConfirm: () => doMoveForce(),
        });
      } else {
        await doMoveNormal();
      }
    } else if (draggedUnscheduled) {
      const duration = (draggedUnscheduled.estimated_hours || 2) * 60;
      const endMin = Math.min(startMin + duration, HOUR_END * 60);
      const newEnd = padTime(Math.floor(endMin / 60), endMin % 60);
      const isReassign = draggedUnscheduled.assigned_to !== techId;

      const doScheduleNormal = async () => {
        setSchedulingId(draggedUnscheduled.id);
        try {
          const result = await scheduleUnscheduledWorkOrder(
            draggedUnscheduled.id,
            draggedUnscheduled.work_order_number,
            draggedUnscheduled.title,
            ds, newStart, newEnd, techId,
            draggedUnscheduled.customer_name || undefined
          );

          if (!result.success && result.conflict) {
            setSchedulingId(null);
            setConfirmAction({
              message: buildConflictMessage(),
              onConfirm: () => doScheduleForce(),
            });
            return;
          }
          if (!result.success) {
            setErrorMessage(result.error || 'Failed to schedule work order. Please try again.');
          }

          await loadData();
          await loadUnscheduled();
        } catch (err) {
          console.error('Error scheduling work order:', err);
          setErrorMessage('Failed to schedule work order. Please try again.');
        } finally {
          setSchedulingId(null);
          if (!confirmAction) {
            setDraggedUnscheduled(null);
            setDropTarget(null);
            setConflictAtTarget(false);
            setPtoConflictAtTarget(false);
          }
        }
      };

      const doScheduleForce = async () => {
        setSchedulingId(draggedUnscheduled.id);
        try {
          const result = await scheduleUnscheduledWorkOrder(
            draggedUnscheduled.id,
            draggedUnscheduled.work_order_number,
            draggedUnscheduled.title,
            ds, newStart, newEnd, techId,
            draggedUnscheduled.customer_name || undefined,
            { force: true }
          );

          if (!result.success) {
            setErrorMessage(result.error || 'Failed to schedule work order. Please try again.');
          }

          await loadData();
          await loadUnscheduled();
        } catch (err) {
          console.error('Error scheduling work order:', err);
          setErrorMessage('Failed to schedule work order. Please try again.');
        } finally {
          setSchedulingId(null);
          setDraggedUnscheduled(null);
          setDropTarget(null);
          setConflictAtTarget(false);
          setPtoConflictAtTarget(false);
          setConfirmAction(null);
        }
      };

      if (conflictAtTarget || ptoConflictAtTarget) {
        setConfirmAction({
          message: buildConflictMessage(),
          onConfirm: () => doScheduleForce(),
        });
      } else {
        await doScheduleNormal();
      }
    }
  }

  function handleEventDragStart(e: React.DragEvent, event: ScheduleEvent) {
    if (event.status === 'completed') return;
    e.dataTransfer.effectAllowed = 'move';
    setDraggedEvent(event);
  }

  function handleUnscheduledDragStart(e: React.DragEvent, wo: UnscheduledWorkOrder) {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedUnscheduled(wo);
  }

  function toggleTechVisibility(techId: string) {
    const next = new Set(hiddenTechs);
    if (next.has(techId)) next.delete(techId);
    else next.add(techId);
    setHiddenTechs(next);
  }

  const totalHeight = TOTAL_HOURS * SLOT_HEIGHT;
  const isToday = isSameDay(anchor, today);

  return (
    <div className="flex flex-col h-full" onClick={() => setEventPopover(null)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 bg-gray-800 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            title={sidebarOpen ? 'Hide unscheduled queue' : 'Show unscheduled queue'}
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className="px-2.5 py-1 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800 rounded transition-colors"
            >
              Today
            </button>
            <button onClick={() => navigate(1)} className="p-1.5 rounded hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="text-sm font-semibold text-white ml-2">
            {anchor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTechFilter(!showTechFilter)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Techs ({visibleTechs.length}/{techs.length})</span>
          </button>
        </div>
      </div>

      {/* Tech filter dropdown */}
      {showTechFilter && (
        <div className="absolute right-4 z-30 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-2 max-h-64 overflow-y-auto">
          {techs.map(tech => {
            const color = getTechColor(tech.id);
            const isHidden = hiddenTechs.has(tech.id);
            return (
              <button
                key={tech.id}
                onClick={() => toggleTechVisibility(tech.id)}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-gray-700 transition-colors ${isHidden ? 'opacity-40' : ''}`}
              >
                <div className={`w-3 h-3 rounded-full ${color.dot}`} />
                <span className="text-gray-200">{tech.full_name}</span>
                {isHidden && <span className="text-gray-500 ml-auto">hidden</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Unscheduled sidebar */}
        {sidebarOpen && (
          <div className="w-64 shrink-0 bg-gray-900 rounded-xl border border-gray-700 flex flex-col overflow-hidden">
            <div className="px-3 py-2.5 bg-gray-800 border-b border-gray-700 shrink-0">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Unscheduled</h3>
                <span className="text-xs text-gray-400 ml-auto">{unscheduled.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {unscheduled.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-xs">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
                  All work orders scheduled
                </div>
              ) : (
                unscheduled.map(wo => (
                  <div
                    key={wo.id}
                    draggable
                    onDragStart={(e) => handleUnscheduledDragStart(e, wo)}
                    onDragEnd={() => { setDraggedUnscheduled(null); setDropTarget(null); }}
                    className={`bg-gray-800 rounded-lg border border-gray-700 p-2.5 cursor-grab hover:border-gray-600 transition-colors ${schedulingId === wo.id ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-1.5 mb-1">
                      <span className="text-[10px] font-mono text-gray-400">{wo.work_order_number}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${getPriorityBadge(wo.priority)}`}>
                        {wo.priority}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-white mb-1 line-clamp-2">{wo.title}</div>
                    {wo.customer_name && (
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-1">
                        <User className="w-2.5 h-2.5" />
                        {wo.customer_name}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-gray-500">
                      <span>{wo.estimated_hours}h est.</span>
                      {wo.assigned_tech_name && (
                        <span className="text-gray-400">{wo.assigned_tech_name.split(' ')[0]}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-gray-700/50">
                      <GripVertical className="w-3 h-3 text-gray-600" />
                      <span className="text-[9px] text-gray-600">Drag to schedule</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Resource grid */}
        <div className="flex-1 bg-gray-900 rounded-xl border border-gray-700 overflow-hidden flex flex-col min-w-0">
          {visibleTechs.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
              No technicians to display. Use the filter to show technicians.
            </div>
          ) : (
            <>
              {/* Tech column headers + time grid in single scroll container */}
              <div className="flex-1 overflow-x-auto min-h-0">
              <div className="min-w-0">
              {/* Tech column headers */}
              <div
                className="grid shrink-0 bg-gray-800 border-b border-gray-700 sticky top-0 z-30"
                style={{ gridTemplateColumns: `52px repeat(${visibleTechs.length}, minmax(140px, 1fr))` }}
              >
                <div className="border-r border-gray-700" />
                {visibleTechs.map(tech => {
                  const color = getTechColor(tech.id);
                  const status = getTechStatus(tech.id);
                  const eventCount = getEventsForTech(tech.id).length;
                  return (
                    <div key={tech.id} className="px-2 py-2.5 text-center border-r border-gray-700/50">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <div className={`w-2 h-2 rounded-full ${
                          status === 'off' ? 'bg-red-500' :
                          status === 'free' ? 'bg-green-500' :
                          status === 'light' ? 'bg-yellow-500' :
                          'bg-orange-500'
                        }`} />
                        <span className={`text-xs font-semibold truncate max-w-[100px] ${color.text}`}>
                          {tech.full_name.split(' ')[0]}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 capitalize">{tech.role}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {isTechOnTimeOff(tech.id) ? (
                          <span className="text-red-400">PTO</span>
                        ) : (
                          <span>{eventCount} {eventCount === 1 ? 'job' : 'jobs'}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Scrollable time grid */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div
                    ref={gridRef}
                    className="relative grid"
                    style={{
                      gridTemplateColumns: `52px repeat(${visibleTechs.length}, minmax(140px, 1fr))`,
                      height: `${totalHeight}px`,
                    }}
                  >
                    {/* Hour labels */}
                    <div className="relative border-r border-gray-700 bg-gray-900/50">
                      {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                        <div
                          key={i}
                          className="absolute right-1.5 flex items-start"
                          style={{ top: `${i * SLOT_HEIGHT}px`, height: `${SLOT_HEIGHT}px` }}
                        >
                          <span className="text-[10px] text-gray-500 font-medium -mt-2 whitespace-nowrap">
                            {formatTime12(padTime(HOUR_START + i, 0))}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Tech columns */}
                    {visibleTechs.map(tech => {
                      const color = getTechColor(tech.id);
                      const techEvents = getEventsForTech(tech.id);
                      const onPto = isTechOnTimeOff(tech.id);

                      return (
                        <div
                          key={tech.id}
                          className={`relative border-r border-gray-700/50 ${onPto ? 'bg-red-500/5' : ''}`}
                          style={{ height: `${totalHeight}px` }}
                          onDragOver={(e) => handleGridDragOver(e, tech.id)}
                          onDragLeave={() => { setDropTarget(null); setConflictAtTarget(false); setPtoConflictAtTarget(false); }}
                          onDrop={(e) => handleGridDrop(e, tech.id)}
                        >
                          {/* Hour grid lines */}
                          {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                            <div
                              key={i}
                              className={`absolute w-full border-t ${i === 0 ? 'border-gray-600' : 'border-gray-700/50'}`}
                              style={{ top: `${i * SLOT_HEIGHT}px` }}
                            />
                          ))}

                          {/* Half-hour lines */}
                          {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                            <div
                              key={`half-${i}`}
                              className="absolute w-full border-t border-dashed border-gray-700/30"
                              style={{ top: `${i * SLOT_HEIGHT + SLOT_HEIGHT / 2}px` }}
                            />
                          ))}

                          {/* PTO overlay */}
                          {onPto && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                              <div className="rotate-[-20deg] text-red-400/20 font-bold text-xl select-none">PTO</div>
                            </div>
                          )}

                          {/* Clickable hour slots */}
                          {!onPto && Array.from({ length: TOTAL_HOURS }, (_, i) => {
                            const hour = HOUR_START + i;
                            return (
                              <div
                                key={`slot-${i}`}
                                className="absolute w-full cursor-pointer hover:bg-white/5 transition-colors"
                                style={{ top: `${i * SLOT_HEIGHT}px`, height: `${SLOT_HEIGHT}px`, zIndex: 1 }}
                                onClick={() => handleSlotClick(tech.id, hour)}
                              />
                            );
                          })}

                          {/* Drop target indicator */}
                          {dropTarget && dropTarget.techId === tech.id && (
                            <div
                              className={`absolute left-0.5 right-0.5 rounded border-2 z-15 pointer-events-none ${
                                conflictAtTarget || ptoConflictAtTarget
                                  ? 'bg-red-500/20 border-red-400'
                                  : 'bg-blue-500/20 border-blue-400'
                              }`}
                              style={{
                                top: `${((dropTarget.minutes - HOUR_START * 60) / 60) * SLOT_HEIGHT}px`,
                                height: `${((draggedEvent
                                  ? toMinutes(draggedEvent.end_time) - toMinutes(draggedEvent.start_time)
                                  : (draggedUnscheduled?.estimated_hours || 2) * 60) / 60) * SLOT_HEIGHT}px`,
                              }}
                            >
                              <div className={`text-[10px] font-medium px-1.5 py-0.5 ${
                                conflictAtTarget || ptoConflictAtTarget ? 'text-red-300' : 'text-blue-300'
                              }`}>
                                {conflictAtTarget || ptoConflictAtTarget ? (
                                  <span className="flex items-center gap-1">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    {conflictAtTarget ? 'Conflict' : 'PTO'}
                                  </span>
                                ) : (
                                  formatTime12(padTime(Math.floor(dropTarget.minutes / 60), dropTarget.minutes % 60))
                                )}
                              </div>
                            </div>
                          )}

                          {/* Events */}
                          {techEvents.map(event => {
                            const top = eventTopPx(event);
                            const height = eventHeightPx(event);
                            const isWO = event.type === 'work_order';
                            const eventColor = isWO ? color : { ...color, light: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700' };
                            const isSaving = savingEventId === event.id;

                            return (
                              <div
                                key={event.id}
                                draggable={event.status !== 'completed' && !isSaving}
                                onDragStart={(e) => handleEventDragStart(e, event)}
                                onDragEnd={() => { setDraggedEvent(null); setDropTarget(null); setConflictAtTarget(false); }}
                                onClick={(e) => handleEventClick(e, event)}
                                className={`absolute left-0.5 right-0.5 rounded overflow-hidden cursor-move transition-opacity hover:opacity-90 z-10 ${eventColor.light} border-l-2 ${eventColor.border} ${getPriorityColor(event.priority || '')} ${isSaving ? 'opacity-50' : ''}`}
                                style={{ top: `${top}px`, height: `${height}px` }}
                                title={`${event.title}\n${event.customer_name || ''}\n${formatTime12(event.start_time)} - ${formatTime12(event.end_time)}\nStatus: ${event.status}\nClick to open, drag to reschedule`}
                              >
                                {isSaving && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <Loader2 className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  </div>
                                )}
                                <div className="px-1.5 py-1 h-full overflow-hidden">
                                  <div className="flex items-center gap-1">
                                    {isWO && <Wrench className="w-2.5 h-2.5 flex-shrink-0 text-gray-600" />}
                                    <span className={`text-[10px] font-semibold truncate leading-tight ${eventColor.text}`}>
                                      {event.title}
                                    </span>
                                    {isWO && <ExternalLink className="w-2 h-2 flex-shrink-0 text-gray-500" />}
                                  </div>
                                  {height > 36 && event.customer_name && (
                                    <div className={`text-[9px] truncate ${eventColor.text} opacity-80 mt-0.5`}>
                                      {event.customer_name}
                                    </div>
                                  )}
                                  {height > 50 && (
                                    <div className={`text-[9px] ${eventColor.text} opacity-60`}>
                                      {formatTime12(event.start_time)} - {formatTime12(event.end_time)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Current time indicator */}
                          {isToday && currentTime.getHours() >= HOUR_START && currentTime.getHours() < HOUR_END && (
                            <div
                              className="absolute left-0 right-0 z-20 pointer-events-none"
                              style={{ top: `${currentTimeTopPx()}px` }}
                            >
                              <div className="relative">
                                <div className="absolute -left-0.5 -top-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                                <div className="border-t-2 border-red-500 w-full" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-[10px] text-gray-500">Free</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-[10px] text-gray-500">Light</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-[10px] text-gray-500">Busy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[10px] text-gray-500">PTO</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <Wrench className="w-3 h-3 text-gray-500" />
          <span className="text-[10px] text-gray-500">Drag unscheduled jobs onto the grid to schedule them</span>
        </div>
      </div>

      {/* Create appointment modal */}
      {showCreateModal && (
        <CreateAppointmentModal
          calendarContext="technicians"
          initialDate={createModalProps.date}
          initialTime={createModalProps.time}
          onClose={() => { setShowCreateModal(false); setCreateModalProps({}); }}
          onSuccess={() => { setShowCreateModal(false); setCreateModalProps({}); loadData(); }}
        />
      )}

      {/* Appointment popover */}
      {eventPopover && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-4 max-w-xs"
          style={{
            left: Math.min(eventPopover.x + 8, window.innerWidth - 280),
            top: Math.min(eventPopover.y + 8, window.innerHeight - 160),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              {eventPopover.event.type === 'work_order'
                ? <Wrench className="w-3.5 h-3.5 text-gray-400" />
                : <Calendar className="w-3.5 h-3.5 text-gray-400" />
              }
              <span className="text-sm font-semibold text-white">{eventPopover.event.title}</span>
            </div>
            <button
              onClick={() => setEventPopover(null)}
              className="text-gray-500 hover:text-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {eventPopover.event.customer_name && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
              <User className="w-3 h-3" />
              {eventPopover.event.customer_name}
            </div>
          )}
          <div className="text-xs text-gray-400 mb-2">
            {formatTime12(eventPopover.event.start_time)} - {formatTime12(eventPopover.event.end_time)}
          </div>
          <div className="text-[10px] text-gray-500 capitalize mb-3">
            Status: {eventPopover.event.status}
          </div>
          {eventPopover.event.status !== 'completed' && (
            <button
              onClick={() => {
                const ev = eventPopover.event;
                setEventPopover(null);
                setDraggedEvent(ev);
                setRescheduleModal({ event: ev });
              }}
              className="w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              Reschedule / Reassign
            </button>
          )}
        </div>
      )}

      {/* Error toast */}
      {errorMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-600 text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-2 max-w-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="ml-auto text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-6 max-w-md mx-4">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-200">{confirmAction.message}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setConfirmAction(null); setDraggedEvent(null); setDraggedUnscheduled(null); setDropTarget(null); setConflictAtTarget(false); setPtoConflictAtTarget(false); }}
                className="px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule modal (tablet/touch fallback) */}
      {rescheduleModal && (
        <RescheduleModal
          event={rescheduleModal.event}
          techs={techs}
          onClose={() => { setRescheduleModal(null); setDraggedEvent(null); }}
          onSuccess={async () => {
            setRescheduleModal(null);
            setDraggedEvent(null);
            await loadData();
            await loadUnscheduled();
          }}
        />
      )}
    </div>
  );
}

function RescheduleModal({
  event,
  techs,
  onClose,
  onSuccess,
}: {
  event: ScheduleEvent;
  techs: Technician[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [techId, setTechId] = useState(event.technician_id || '');
  const [date, setDate] = useState(event.date);
  const [startTime, setStartTime] = useState(event.start_time);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const duration = toMinutes(event.end_time) - toMinutes(event.start_time);

  async function handleSubmit(force: boolean = false) {
    setSaving(true);
    setError(null);
    setConflict(false);

    const endMin = toMinutes(startTime) + duration;
    const newEnd = padTime(Math.floor(endMin / 60), endMin % 60);

    const isReassign = techId !== event.technician_id;
    const result = event.type === 'work_order'
      ? await rescheduleWorkOrder(event.id, date, startTime, newEnd, isReassign ? techId : undefined, { force })
      : await rescheduleAppointment(event.id, date, startTime, newEnd, isReassign ? techId : undefined, { force });

    if (!result.success && result.conflict && !force) {
      setConflict(true);
      setSaving(false);
      return;
    }
    if (!result.success) {
      setError(result.error || 'Failed to reschedule');
      setSaving(false);
      return;
    }

    setSaving(false);
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Reschedule / Reassign</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Technician</label>
            <select
              value={techId}
              onChange={(e) => setTechId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm"
            >
              <option value="">Unassigned</option>
              {techs.map(t => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm"
            />
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Duration: {Math.floor(duration / 60)}h {duration % 60}m
          </div>
        </div>

        {conflict && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-red-300 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Scheduling conflict detected. Proceed anyway?
            </div>
            <button
              onClick={() => handleSubmit(true)}
              disabled={saving}
              className="w-full px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
            >
              {saving ? 'Saving...' : 'Override and Proceed'}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-3 text-xs text-red-400">{error}</div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
