import ConfirmModal from '../ui/ConfirmModal';
import { rescheduleAppointment, rescheduleWorkOrder } from '../../lib/scheduling';
import { CalendarMonthGrid } from '../Shared/Calendar/CalendarMonthGrid';
import { CalendarGantt } from '../Shared/Calendar/CalendarGantt';
import { CalendarWorkspace } from '../Shared/Calendar/CalendarWorkspace';
import { useEffect, useId, useRef, useState, useMemo } from 'react';
import { Calendar, Clock, RefreshCw } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { supabase } from '../../lib/supabase';
import { getOrganizationTimezone } from '../../lib/timezoneUtils';
import { addDays, dateKey, loadCalendarPages, minutes, overlappingBookings, schedulingError, selectionDuration, timeKey, timeLabel, weekDates, monthDates, calendarPeriodDays, type CalendarBooking, type ScheduleSelection } from '../../lib/workOrderScheduling';

import { CalendarNavigation, CalendarViewSwitcher } from '../Shared/Calendar/CalendarControls';
import { CalendarTimeGrid, CALENDAR_FIRST_MINUTE, CALENDAR_ROW_HEIGHT } from '../Shared/Calendar/CalendarTimeGrid';

interface Technician { id: string; full_name: string }
interface Props {
  organizationId?: string | null;
  technicians: Technician[];
  technicianIds: string[];
  onTechniciansChange: (ids: string[]) => void;
  value: ScheduleSelection;
  onChange: (value: ScheduleSelection) => void;
  onValidationChange: (error: string | null) => void;
  earliestDate?: string | null;
  initialMode?: 'browse' | 'manual';
  excludeWorkOrderIds?: string[];
  errors?: Record<string, string>;
  showTechnicianSelection?: boolean;
  showManualEntry?: boolean;
}
const ROW_HEIGHT = CALENDAR_ROW_HEIGHT;
const FIRST_MINUTE = CALENDAR_FIRST_MINUTE;
const EMPTY_IDS: string[] = [];

export function WorkOrderSchedulePicker({ organizationId, technicians, technicianIds, onTechniciansChange, value, onChange, onValidationChange, earliestDate, errors = {}, showTechnicianSelection = true, showManualEntry = true, initialMode = 'browse', excludeWorkOrderIds = EMPTY_IDS }: Props) {
  const [draggedBooking, setDraggedBooking] = useState<CalendarBooking | null>(null);
  const [moveConfirmation, setMoveConfirmation] = useState<{ message: string; confirm: () => void } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [mode, setMode] = useState<'browse' | 'manual'>(initialMode);
  const [view, setView] = useState<'day' | 'week' | 'month' | 'gantt'>('day');
  const [anchor, setAnchor] = useState(value.date || earliestDate || dateKey(new Date()));
  const [weekTechnician, setWeekTechnician] = useState('');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  const navigated = useRef(false);
  const today = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
  const days = useMemo(() => view === 'month' ? monthDates(anchor) : view === 'gantt' ? Array.from({ length: 14 }, (_, i) => addDays(anchor, i)) : view === 'week' ? weekDates(anchor) : [anchor], [view, anchor]);
  const dateStart = days[0];
  const dateEnd = days[days.length - 1];
  const extraDate = value.date && (value.date < dateStart || value.date > dateEnd) ? value.date : '';
  const datesToLoad = useMemo(() => extraDate ? [...days, extraDate] : days, [extraDate, days]);
  const excludedIdsKey = excludeWorkOrderIds.slice().sort().join(',');
  const allIdsKey = technicians.map(t => t.id).sort().join(',');
  const queryKey = [organizationId, allIdsKey, dateStart, dateEnd, extraDate, excludedIdsKey, revision].join('|');
  const availableTechnicians = technicianIds.length ? technicians.filter(t => technicianIds.includes(t.id)) : technicians;
  const weekTech = technicians.find(t => t.id === weekTechnician) || availableTechnicians[0];
  const weekIds = technicianIds.length ? technicianIds : weekTech ? [weekTech.id] : EMPTY_IDS;
  const columns = view === 'day'
    ? technicians.map(tech => ({ key: tech.id, label: tech.full_name, date: anchor, ids: [tech.id] }))
    : days.map(date => ({ key: date, label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + new Date(date + 'T12:00:00').getDate(), date, ids: weekIds }));

  useEffect(() => {
    let cancelled = false;
    getOrganizationTimezone(organizationId || undefined).then(zone => {
      if (cancelled) return;
      setTimezone(zone);
      if (!navigated.current && !value.date && !earliestDate) setAnchor(formatInTimeZone(new Date(), zone, 'yyyy-MM-dd'));
    });
    return () => { cancelled = true; };
  }, [organizationId, earliestDate, value.date]);

  useEffect(() => { if (value.date) setAnchor(value.date); }, [value.date]);
  useEffect(() => { if (scrollRef.current && mode === 'browse') scrollRef.current.scrollTop = (8 * 60 - FIRST_MINUTE) / 30 * ROW_HEIGHT; }, [mode, view]);

  useEffect(() => {
    if (!organizationId || !allIdsKey) {
      setBookings([]); setLoading(false); setLoadedKey(queryKey);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => controller.abort(), 15000);
    setLoading(true); setLoadError(null);
    async function load() {
      try {
        const ids = allIdsKey.split(',');
        const dateFilter = (column: string) => 'and(' + column + '.gte.' + dateStart + ',' + column + '.lte.' + dateEnd + ')' + (extraDate ? ',' + column + '.eq.' + extraDate : '');
        const ptoFilter = 'and(start_date.lte.' + dateEnd + ',end_date.gte.' + dateStart + ')' + (extraDate ? ',and(start_date.lte.' + extraDate + ',end_date.gte.' + extraDate + ')' : '');
        const results = await Promise.all([
          loadCalendarPages(supabase.from('work_orders').select('id,title,scheduled_date,scheduled_start_time,scheduled_end_time,assigned_to,status', { count: 'exact' })
            .eq('organization_id', organizationId).in('assigned_to', ids)
            .or(dateFilter('scheduled_date'))
            .not('is_archived', 'is', true).not('status', 'in', '("completed","cancelled","archived","split")').order('id').abortSignal(controller.signal)),
          loadCalendarPages(supabase.from('appointments').select('id,title,appointment_date,start_time,end_time,assigned_technician,all_day,is_private,status', { count: 'exact' })
            .eq('organization_id', organizationId).in('assigned_technician', ids)
            .or(dateFilter('appointment_date'))
            .not('status', 'in', '("completed","cancelled","archived")').order('id').abortSignal(controller.signal)),
          loadCalendarPages(supabase.from('pto_requests').select('id,employee_id,start_date,end_date', { count: 'exact' })
            .eq('organization_id', organizationId).in('employee_id', ids).eq('status', 'approved')
            .or(ptoFilter).order('id').abortSignal(controller.signal)),
        ]);
        const items: CalendarBooking[] = [
          ...(results[0].data || []).filter(wo => !excludedIdsKey.split(',').includes(wo.id)).map(wo => ({ id: wo.id, technicianId: wo.assigned_to, date: wo.scheduled_date,
            start: wo.scheduled_start_time && wo.scheduled_end_time && minutes(wo.scheduled_end_time) > minutes(wo.scheduled_start_time) ? wo.scheduled_start_time.slice(0, 5) : '00:00',
            end: wo.scheduled_start_time && wo.scheduled_end_time && minutes(wo.scheduled_end_time) > minutes(wo.scheduled_start_time) ? wo.scheduled_end_time.slice(0, 5) : '24:00',
            title: wo.title || 'Work order', kind: 'work_order' as const, canMove: wo.status !== 'completed' && Boolean(wo.scheduled_start_time && wo.scheduled_end_time) })),
          ...(results[1].data || []).map(apt => ({ id: apt.id, technicianId: apt.assigned_technician, date: apt.appointment_date,
            start: apt.all_day || !apt.start_time || !apt.end_time || minutes(apt.end_time) <= minutes(apt.start_time) ? '00:00' : apt.start_time.slice(0, 5),
            end: apt.all_day || !apt.start_time || !apt.end_time || minutes(apt.end_time) <= minutes(apt.start_time) ? '24:00' : apt.end_time.slice(0, 5),
            title: apt.is_private ? 'Busy' : apt.title || 'Appointment', kind: 'appointment' as const, canMove: !apt.is_private && apt.status !== 'completed' && !apt.all_day && Boolean(apt.start_time && apt.end_time) })),
        ];
        for (const pto of results[2].data || []) {
          for (const date of datesToLoad) {
            if (date >= pto.start_date && date <= pto.end_date) items.push({ id: pto.id + date, technicianId: pto.employee_id, date, start: '00:00', end: '24:00', title: 'Time off', kind: 'time_off' });
          }
        }
        if (!cancelled) { setBookings(items); setLoadedKey(queryKey); }
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading technician availability:', error);
          setLoadError('Availability could not be loaded. Retry before scheduling.');
        }
      } finally {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [queryKey, organizationId, allIdsKey, dateStart, dateEnd, extraDate, excludedIdsKey, datesToLoad]);

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase.channel('work-order-schedule-picker-' + organizationId + instanceId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: 'organization_id=eq.' + organizationId }, () => setRevision(r => r + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: 'organization_id=eq.' + organizationId }, () => setRevision(r => r + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pto_requests', filter: 'organization_id=eq.' + organizationId }, () => setRevision(r => r + 1)).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [organizationId, instanceId]);

  const conflicts = overlappingBookings(bookings, technicianIds, value);
  const complete = Boolean(value.date && value.start && value.end && technicianIds.length);
  const scheduleError = (moving ? 'Saving calendar move…' : null) || schedulingError(value) || (earliestDate && value.date && value.date < earliestDate ? 'Schedule on or after ' + earliestDate + '.' : null) ||
    (complete && loadError ? loadError : complete && (loading || loadedKey !== queryKey) ? 'Checking availability…' : complete && conflicts.length ? 'Already booked: ' + [...new Set(conflicts.map(item => technicians.find(t => t.id === item.technicianId)?.full_name || 'Technician'))].join(', ') + '. Choose another time.' : null);
  useEffect(() => { onValidationChange(scheduleError); }, [scheduleError, onValidationChange]);

  function selectSlot(date: string, start: string, columnIds: string[]) {
    const ids = technicianIds.length > 1 ? technicianIds : columnIds;
    const end = timeKey(minutes(start) + selectionDuration(value));
    const slot = { date, start, end };
    if (!ids.length || loading || loadError || loadedKey !== queryKey || minutes(end) >= 1440 || schedulingError(slot) ||
        (earliestDate && date < earliestDate) || overlappingBookings(bookings, ids, slot).length) return;
    navigated.current = true;
    onTechniciansChange(ids);
    onChange(slot);
  }

  function proposeMove(date: string, start: string, targetId: string) {
    const item = draggedBooking;
    if (!item || moving) return;
    const end = timeKey(minutes(start) + (minutes(item.end) - minutes(item.start)));
    const next = { date, start, end };
    const ids = item.id === 'draft' ? technicianIds.length > 1 ? technicianIds : [targetId] : [targetId];
    const others = bookings.filter(booking => !(item.id !== 'draft' && booking.id === item.id && booking.kind === item.kind));
    if (schedulingError(next) || earliestDate && date < earliestDate || overlappingBookings(others, ids, next).length) {
      setMoveError('That time is not available. Choose an open spot.'); return;
    }
    const name = technicians.find(tech => tech.id === targetId)?.full_name || 'the selected team';
    setMoveConfirmation({ message: `Move “${item.title}” to ${date}, ${timeLabel(start)} – ${timeLabel(end)} for ${ids.length > 1 ? 'the selected team' : name}?`, confirm: () => {
      setMoveConfirmation(null); setMoveError(null);
      if (item.id === 'draft') { onTechniciansChange(ids); onChange(next); return; }
      setMoving(true);
      void (item.kind === 'work_order' ? rescheduleWorkOrder : rescheduleAppointment)(item.id, date, start, end, targetId !== item.technicianId ? targetId : undefined)
        .then(result => { if (!result.success) setMoveError(result.conflict ? 'That time was just booked. Choose another spot.' : result.error || 'Move could not be saved.'); else setRevision(r => r + 1); })
        .catch(() => setMoveError('Move could not be saved. Retry.')).finally(() => setMoving(false));
    } });
  }
  function gridEvents(column: typeof columns[number]) {
    const items = bookings.filter(item => column.ids.includes(item.technicianId) && item.date === column.date);
    if (complete && value.date === column.date && column.ids.some(id => technicianIds.includes(id))) items.push({ id: 'draft', technicianId: column.ids[0], date: value.date, start: value.start, end: value.end, title: 'New work order', kind: 'work_order', canMove: true });
    return items.map(item => ({ id: item.kind + item.id + item.technicianId, columnKey: column.key, start: item.start, end: item.end,
      title: (view === 'week' && column.ids.length > 1 ? (technicians.find(t => t.id === item.technicianId)?.full_name || '') + ': ' : '') + item.title,
      kind: item.kind, allDay: item.start === '00:00' && item.end === '24:00', draggable: item.canMove,
      onDragStart: () => setDraggedBooking(item), onDragEnd: () => setDraggedBooking(null),
    }));
  }

  function move(count: number) { navigated.current = true; if (view === 'month') { const date = new Date(anchor.slice(0, 8) + '01T12:00:00'); date.setMonth(date.getMonth() + Math.sign(count)); setAnchor(dateKey(date)); } else setAnchor(addDays(anchor, count)); }
  const inputClass = 'w-full min-w-0 min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500';

  return <section aria-label="Work order scheduling" className="rounded-xl border border-gray-200 bg-white text-gray-900 overflow-hidden">
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h3 className="font-semibold flex items-center gap-2"><Calendar className="h-5 w-5 text-blue-600" />Schedule</h3>
        {showManualEntry && <div className="grid grid-cols-1 sm:grid-cols-2 w-full sm:w-auto bg-gray-100 p-1 rounded-lg" aria-label="Scheduling method">
          <button type="button" aria-pressed={mode === 'browse'} onClick={() => setMode('browse')} className={'min-h-11 px-3 text-sm rounded-md ' + (mode === 'browse' ? 'bg-white shadow-sm text-blue-700 font-semibold' : 'text-gray-600')}>Browse calendar</button>
          <button type="button" aria-pressed={mode === 'manual'} onClick={() => setMode('manual')} className={'min-h-11 px-3 text-sm rounded-md ' + (mode === 'manual' ? 'bg-white shadow-sm text-blue-700 font-semibold' : 'text-gray-600')}>Enter date & time</button>
        </div>}
      </div>
      {showTechnicianSelection && <fieldset>
        <legend className="text-sm font-medium mb-2">Technicians <span className="text-gray-500 font-normal">· select one or more</span></legend>
        <div className="flex flex-wrap gap-2">
          {technicians.map(tech => <label key={tech.id} className={'flex items-center gap-2 min-h-11 px-3 rounded-lg border cursor-pointer text-sm ' + (technicianIds.includes(tech.id) ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 hover:bg-gray-50')}>
            <input type="checkbox" checked={technicianIds.includes(tech.id)} onChange={() => onTechniciansChange(technicianIds.includes(tech.id) ? technicianIds.filter(id => id !== tech.id) : [...technicianIds, tech.id])} />{tech.full_name}
          </label>)}
          {!technicians.length && <p className="text-sm text-gray-500">No active technicians available.</p>}
        </div>
        {errors.technicians && <p className="mt-2 text-sm text-red-600">{errors.technicians}</p>}
        {technicianIds.length > 1 && <p className="mt-2 text-xs text-gray-500">One linked work order per technician. Calendar selections must be open for everyone selected.</p>}
      </fieldset>}
    </div>

    {mode === 'browse' && <CalendarWorkspace tabHref={'/calendar?' + new URLSearchParams({ popup: 'true', view: 'technicians', viewMode: view, date: anchor, technicianIds: (technicianIds.length ? technicianIds : view === 'week' ? weekIds : []).join(',') }).toString()}>
      <div className="px-4 py-2 border-y border-gray-200 flex flex-wrap items-center gap-2 bg-gray-50">
        <CalendarNavigation date={anchor} onPrevious={() => move(-calendarPeriodDays(view))} onNext={() => move(calendarPeriodDays(view))} onToday={() => { navigated.current = true; setAnchor(today); }} onDateChange={date => { navigated.current = true; setAnchor(date); }} />
        <CalendarViewSwitcher value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'gantt', label: 'Gantt' }]} />
        <button type="button" aria-label="Refresh availability" onClick={() => setRevision(r => r + 1)} className="min-h-11 min-w-11 hover:bg-gray-200 rounded-lg order-4 sm:order-none"><RefreshCw className="h-4 w-4 mx-auto" /></button>
        {view === 'week' && !technicianIds.length && <label className="text-sm flex items-center gap-2 w-full">Calendar for<select aria-label="Calendar technician" value={weekTech?.id || ''} onChange={e => setWeekTechnician(e.target.value)} className="min-h-11 border border-gray-200 rounded-lg p-2 bg-white">{technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}</select></label>}
      </div>
      <p className="px-4 py-2 text-xs text-gray-500">Click an open time to schedule, or drag a booking to move it. Moves require confirmation. Booked time is shaded. {view === 'day' && technicianIds.length <= 1 ? 'Clicking a technician’s column assigns them.' : ''}</p>
      {(view === 'day' || view === 'week') && <CalendarTimeGrid scrollRef={scrollRef} columns={columns} columnWidth={view === 'week' ? 100 : 150} loading={loading || loadedKey !== queryKey || moving} error={loadError} onRetry={() => setRevision(r => r + 1)}
        events={columns.flatMap(gridEvents)}
        onDropSlot={(column, start) => { const ids = columns.find(c => c.key === column.key)!.ids; proposeMove(column.date, start, ids.length === 1 ? ids[0] : draggedBooking?.technicianId || ids[0]); }}
        onSlotSelect={(column, start) => selectSlot(column.date, start, columns.find(c => c.key === column.key)!.ids)}
        slotState={(column, start) => {
          const ids = view === 'day' && technicianIds.length <= 1 ? columns.find(c => c.key === column.key)!.ids : technicianIds.length ? technicianIds : columns.find(c => c.key === column.key)!.ids;
          const end = timeKey(minutes(start) + selectionDuration(value));
          return { disabled: !ids.length || view === 'day' && technicianIds.length > 1 && !technicianIds.includes(column.key) || overlappingBookings(bookings, ids, { date: column.date, start, end }).length > 0 || minutes(end) >= 1440 || Boolean(earliestDate && column.date < earliestDate),
            selected: value.date === column.date && columns.find(c => c.key === column.key)!.ids.some(id => technicianIds.includes(id)) && minutes(start) >= minutes(value.start) && minutes(start) < minutes(value.end) };
        }} />}
      {view === 'month' && <CalendarMonthGrid date={anchor} loading={loading || loadedKey !== queryKey || moving} error={loadError} onRetry={() => setRevision(r => r + 1)}
        events={bookings.filter(item => availableTechnicians.some(tech => tech.id === item.technicianId)).map(item => ({ id: item.kind + item.id + item.technicianId, columnKey: item.date, date: item.date, start: item.start, end: item.end, title: item.title, kind: item.kind, allDay: item.start === '00:00' && item.end === '24:00', draggable: item.canMove, onDragStart: () => setDraggedBooking(item), onDragEnd: () => setDraggedBooking(null) }))}
        onEventDrop={date => { if (draggedBooking) proposeMove(date, draggedBooking.start, draggedBooking.technicianId); }} onDateSelect={date => { navigated.current = true; setAnchor(date); setView('day'); }} />}
      {view === 'gantt' && <CalendarGantt dates={days} tracks={availableTechnicians.map(tech => ({ id: tech.id, label: tech.full_name }))} loading={loading || loadedKey !== queryKey || moving} error={loadError} onRetry={() => setRevision(r => r + 1)}
        events={bookings.filter(item => availableTechnicians.some(tech => tech.id === item.technicianId)).map(item => ({ ...item, id: item.kind + item.id + item.technicianId, columnKey: item.date, allDay: item.start === '00:00' && item.end === '24:00', draggable: item.canMove, onDragStart: () => setDraggedBooking(item), onDragEnd: () => setDraggedBooking(null) }))}
        onEventDrop={(date, techId) => { if (draggedBooking) proposeMove(date, draggedBooking.start, techId); }} onDateSelect={date => { navigated.current = true; setAnchor(date); setView('day'); }} />}
      {moveError && <p role="alert" className="p-3 text-sm text-red-700">{moveError}</p>}
      <ConfirmModal isOpen={Boolean(moveConfirmation)} title="Confirm calendar move" message={moveConfirmation?.message || ''} variant="neutral" confirmLabel="Confirm move" onConfirm={() => moveConfirmation?.confirm()} onCancel={() => setMoveConfirmation(null)} />
    </CalendarWorkspace>}

    <div className="p-4 space-y-3">
      {showManualEntry && <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-sm font-medium">Date<input aria-label="Work order date" type="date" min={earliestDate || undefined} value={value.date} onChange={e => { navigated.current = true; onChange({ ...value, date: e.target.value }); }} className={inputClass} />{errors.start_date && <span className="text-xs text-red-600">{errors.start_date}</span>}</label>
        <label className="text-sm font-medium">Start<input aria-label="Work order start time" type="time" step="60" value={value.start} onChange={e => onChange({ ...value, start: e.target.value })} className={inputClass} />{errors.start_time && <span className="text-xs text-red-600">{errors.start_time}</span>}</label>
        <label className="text-sm font-medium">End<input aria-label="Work order end time" type="time" step="60" value={value.end} onChange={e => onChange({ ...value, end: e.target.value })} className={inputClass} />{errors.end_time && <span className="text-xs text-red-600">{errors.end_time}</span>}</label>
      </div>}
      <p className="text-xs text-gray-500 flex flex-wrap items-center gap-2"><Clock className="w-3.5 h-3.5" />{value.start && value.end && !schedulingError(value) ? (selectionDuration(value) % 60 === 0 ? selectionDuration(value) / 60 + (selectionDuration(value) === 60 ? ' hour' : ' hours') : selectionDuration(value) + ' min') + ' · ' : ''}Times shown in {timezone.replace(/_/g, ' ')}.</p>
      {scheduleError && <p role="alert" className="text-sm text-red-700">{scheduleError}{loadError && mode === 'manual' && <button type="button" onClick={() => setRevision(r => r + 1)} className="min-h-11 ml-2 underline">Retry availability</button>}</p>}
    </div>
  </section>;
}
