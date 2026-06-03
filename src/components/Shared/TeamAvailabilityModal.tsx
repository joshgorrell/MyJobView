import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  X, ChevronLeft, ChevronRight, Calendar, Clock, User, AlertTriangle,
  CheckCircle, Users
} from 'lucide-react';

interface Technician {
  id: string;
  full_name: string;
}

interface ScheduleItem {
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
}

interface TeamAvailabilityModalProps {
  onClose: () => void;
  onSelectSlot: (technicianId: string, date: string, startTime: string, endTime: string) => void;
  initialDate?: string;
  preSelectedTechIds?: string[];
}

const TIME_SLOTS = [
  '06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30',
  '10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30',
  '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
  '18:00','18:30','19:00','19:30','20:00'
];

const HOUR_SLOTS = [
  '06:00','07:00','08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'
];

const TECH_COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800', header: 'bg-blue-600', light: 'bg-blue-50' },
  { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-800', header: 'bg-emerald-600', light: 'bg-emerald-50' },
  { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-800', header: 'bg-amber-600', light: 'bg-amber-50' },
  { bg: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-800', header: 'bg-rose-600', light: 'bg-rose-50' },
  { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-800', header: 'bg-cyan-600', light: 'bg-cyan-50' },
  { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-800', header: 'bg-violet-600', light: 'bg-violet-50' },
  { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-800', header: 'bg-orange-600', light: 'bg-orange-50' },
  { bg: 'bg-teal-100', border: 'border-teal-400', text: 'text-teal-800', header: 'bg-teal-600', light: 'bg-teal-50' },
];

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function TeamAvailabilityModal({
  onClose,
  onSelectSlot,
  initialDate,
  preSelectedTechIds = []
}: TeamAvailabilityModalProps) {
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [currentDate, setCurrentDate] = useState<Date>(
    initialDate ? new Date(initialDate + 'T12:00:00') : new Date()
  );
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [visibleTechIds, setVisibleTechIds] = useState<string[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [techColorMap, setTechColorMap] = useState<Record<string, typeof TECH_COLORS[0]>>({});
  const [hoveredSlot, setHoveredSlot] = useState<{ techId: string; date: string; time: string } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ techId: string; date: string; startTime: string; endTime: string } | null>(null);
  const [currentTime] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTechnicians();
  }, []);

  useEffect(() => {
    if (technicians.length > 0) loadSchedule();
  }, [technicians, currentDate, viewMode]);

  // Scroll to 7am on mount
  useEffect(() => {
    if (scrollRef.current && !loading) {
      const slot7am = scrollRef.current.querySelector('[data-time="07:00"]');
      if (slot7am) {
        (slot7am as HTMLElement).scrollIntoView({ block: 'start' });
      }
    }
  }, [loading]);

  async function loadTechnicians() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('role', ['tech', 'service_manager', 'manager', 'admin'])
      .eq('active', true)
      .order('full_name');

    const techs = data || [];
    setTechnicians(techs);

    // Default: show all techs, but if preSelectedTechIds given, show those first
    const defaultVisible = preSelectedTechIds.length > 0
      ? preSelectedTechIds
      : techs.slice(0, 6).map(t => t.id);
    setVisibleTechIds(defaultVisible);

    const colorMap: Record<string, typeof TECH_COLORS[0]> = {};
    techs.forEach((tech, i) => {
      colorMap[tech.id] = TECH_COLORS[i % TECH_COLORS.length];
    });
    setTechColorMap(colorMap);
  }

  async function loadSchedule() {
    setLoading(true);
    try {
      const startDate = viewMode === 'week' ? getWeekStart(currentDate) : toDateStr(currentDate);
      const endDate = viewMode === 'week' ? getWeekEnd(currentDate) : toDateStr(currentDate);

      const techIds = technicians.map(t => t.id);
      if (techIds.length === 0) return;

      const [{ data: wos }, { data: apts }] = await Promise.all([
        supabase
          .from('work_orders')
          .select('id, title, start_date, start_time, end_time, status, priority, assigned_to, contacts(full_name, company_name)')
          .in('assigned_to', techIds)
          .gte('start_date', startDate)
          .lte('start_date', endDate)
          .not('status', 'in', '("completed","cancelled","archived")'),
        supabase
          .from('appointments')
          .select('id, title, appointment_date, start_time, end_time, status, customer_name, technician_id')
          .in('technician_id', techIds)
          .gte('appointment_date', startDate)
          .lte('appointment_date', endDate)
          .not('status', 'eq', 'cancelled')
      ]);

      const items: ScheduleItem[] = [
        ...(wos || []).map((wo: any) => ({
          id: wo.id,
          title: wo.title,
          date: wo.start_date,
          start_time: wo.start_time || '08:00',
          end_time: wo.end_time || '17:00',
          type: 'work_order' as const,
          status: wo.status,
          technician_id: wo.assigned_to,
          customer_name: wo.contacts?.full_name || wo.contacts?.company_name,
          priority: wo.priority
        })),
        ...(apts || []).map((apt: any) => ({
          id: apt.id,
          title: apt.title,
          date: apt.appointment_date,
          start_time: apt.start_time,
          end_time: apt.end_time,
          type: 'appointment' as const,
          status: apt.status,
          technician_id: apt.technician_id,
          customer_name: apt.customer_name
        }))
      ];
      setScheduleItems(items);
    } finally {
      setLoading(false);
    }
  }

  function getWeekStart(d: Date): string {
    const s = new Date(d);
    s.setDate(s.getDate() - s.getDay());
    return toDateStr(s);
  }

  function getWeekEnd(d: Date): string {
    const e = new Date(d);
    e.setDate(e.getDate() - e.getDay() + 6);
    return toDateStr(e);
  }

  function getWeekDays(): Date[] {
    const days: Date[] = [];
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }

  function navigate(dir: 'prev' | 'next') {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() + (dir === 'next' ? 1 : -1));
    else d.setDate(d.getDate() + (dir === 'next' ? 7 : -7));
    setCurrentDate(d);
  }

  function getItemsFor(techId: string, date: Date, timeSlot: string): ScheduleItem[] {
    const dateStr = toDateStr(date);
    return scheduleItems.filter(item => {
      if (item.technician_id !== techId) return false;
      if (item.date !== dateStr) return false;
      const s = item.start_time.substring(0, 5);
      const e = item.end_time.substring(0, 5);
      return s <= timeSlot && e > timeSlot;
    });
  }

  function getWorkloadForDay(techId: string, date: Date): { count: number; hours: number } {
    const dateStr = toDateStr(date);
    const items = scheduleItems.filter(i => i.technician_id === techId && i.date === dateStr);
    const hours = items.reduce((sum, item) => {
      const [sh, sm] = item.start_time.split(':').map(Number);
      const [eh, em] = item.end_time.split(':').map(Number);
      return sum + (eh * 60 + em - sh * 60 - sm) / 60;
    }, 0);
    return { count: items.length, hours: Math.round(hours * 10) / 10 };
  }

  function isToday(d: Date): boolean {
    const t = new Date();
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
  }

  function getCurrentTimePos(): number {
    const h = currentTime.getHours();
    const m = currentTime.getMinutes();
    const total = h * 60 + m;
    const start = 6 * 60;
    const end = 20 * 60;
    if (total < start || total > end) return -1;
    return ((total - start) / (end - start)) * 100;
  }

  function handleSlotClick(techId: string, date: Date, timeSlot: string) {
    const dateStr = toDateStr(date);
    const [h, mins] = timeSlot.split(':').map(Number);
    const endH = h + 1;
    const endTime = `${endH.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    setSelectedSlot({ techId, date: dateStr, startTime: timeSlot, endTime });
  }

  function handleConfirm() {
    if (!selectedSlot) return;
    onSelectSlot(selectedSlot.techId, selectedSlot.date, selectedSlot.startTime, selectedSlot.endTime);
    onClose();
  }

  function toggleTechVisible(techId: string) {
    setVisibleTechIds(prev =>
      prev.includes(techId)
        ? prev.filter(id => id !== techId)
        : [...prev, techId]
    );
  }

  const visibleTechs = technicians.filter(t => visibleTechIds.includes(t.id));
  const days = viewMode === 'week' ? getWeekDays() : [currentDate];
  const timePos = getCurrentTimePos();

  const selectedTech = selectedSlot ? technicians.find(t => t.id === selectedSlot.techId) : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-2">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] max-h-[95vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-slate-800 to-slate-700 text-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Team Availability</h2>
              <p className="text-xs text-slate-300">Click any open slot to select a technician and time</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0 flex-wrap gap-y-2">
          {/* View toggle */}
          <div className="flex bg-white rounded-lg border border-gray-200 p-0.5 shadow-sm">
            <button
              onClick={() => setViewMode('day')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${viewMode === 'day' ? 'bg-slate-700 text-white shadow' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${viewMode === 'week' ? 'bg-slate-700 text-white shadow' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Week
            </button>
          </div>

          {/* Date navigation */}
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('prev')} className="p-1.5 hover:bg-white rounded-lg border border-gray-200 transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="text-sm font-semibold text-gray-800 min-w-[180px] text-center">
              {viewMode === 'day'
                ? currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                : `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              }
            </span>
            <button onClick={() => navigate('next')} className="p-1.5 hover:bg-white rounded-lg border border-gray-200 transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-600 transition-colors"
            >
              Today
            </button>
          </div>

          {/* Confirmation banner */}
          {selectedSlot && selectedTech && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-300 rounded-lg px-4 py-2">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm text-green-800 font-medium">
                {selectedTech.full_name} — {new Date(selectedSlot.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} {fmt12(selectedSlot.startTime)}–{fmt12(selectedSlot.endTime)}
              </span>
              <button
                onClick={handleConfirm}
                className="px-3 py-1 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                Use This Slot
              </button>
            </div>
          )}
        </div>

        {/* Tech filter pills */}
        <div className="flex items-center gap-2 px-6 py-2 border-b border-gray-100 flex-shrink-0 overflow-x-auto">
          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Show:</span>
          {technicians.map(tech => {
            const color = techColorMap[tech.id];
            const isVisible = visibleTechIds.includes(tech.id);
            return (
              <button
                key={tech.id}
                onClick={() => toggleTechVisible(tech.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                  isVisible
                    ? `${color?.bg || 'bg-gray-100'} ${color?.border || 'border-gray-300'} ${color?.text || 'text-gray-700'}`
                    : 'bg-white border-gray-200 text-gray-400 opacity-50'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${isVisible ? (color?.header || 'bg-gray-400') : 'bg-gray-300'}`} />
                {tech.full_name.split(' ')[0]}
              </button>
            );
          })}
        </div>

        {/* Calendar body */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-4 border-slate-600 border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Loading schedules...</p>
              </div>
            </div>
          ) : viewMode === 'day' ? (
            <DayView
              date={currentDate}
              visibleTechs={visibleTechs}
              technicians={technicians}
              scheduleItems={scheduleItems}
              techColorMap={techColorMap}
              selectedSlot={selectedSlot}
              hoveredSlot={hoveredSlot}
              setHoveredSlot={setHoveredSlot}
              onSlotClick={handleSlotClick}
              timePos={timePos}
              isToday={isToday(currentDate)}
              scrollRef={scrollRef}
              fmt12={fmt12}
              getItemsFor={getItemsFor}
            />
          ) : (
            <WeekView
              days={days}
              visibleTechs={visibleTechs}
              scheduleItems={scheduleItems}
              techColorMap={techColorMap}
              selectedSlot={selectedSlot}
              onSlotClick={handleSlotClick}
              onDayClick={(d) => { setCurrentDate(d); setViewMode('day'); }}
              isToday={isToday}
              getWorkloadForDay={getWorkloadForDay}
              fmt12={fmt12}
              toDateStr={toDateStr}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-6 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-3 bg-yellow-100 border border-yellow-400 rounded" />
            <span>Assigned</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-3 bg-blue-100 border border-blue-400 rounded" />
            <span>In Progress</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-3 bg-green-100 border border-green-400 rounded" />
            <span>Appointment</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-4 h-0.5 bg-red-500" />
            <span>Current time</span>
          </div>
          <div className="ml-auto text-xs text-gray-400">
            {viewMode === 'day' ? 'Click an open slot to select it, then click "Use This Slot"' : 'Click a day to drill into hourly view'}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Day View Component ── */
// Each hour = ROW_HEIGHT px. Half-hour slots = ROW_HEIGHT/2 px.
const ROW_HEIGHT = 56; // px per 30-min slot

interface DayViewProps {
  date: Date;
  visibleTechs: Technician[];
  technicians: Technician[];
  scheduleItems: ScheduleItem[];
  techColorMap: Record<string, typeof TECH_COLORS[0]>;
  selectedSlot: { techId: string; date: string; startTime: string; endTime: string } | null;
  hoveredSlot: { techId: string; date: string; time: string } | null;
  setHoveredSlot: (s: { techId: string; date: string; time: string } | null) => void;
  onSlotClick: (techId: string, date: Date, time: string) => void;
  timePos: number;
  isToday: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  fmt12: (t: string) => string;
  getItemsFor: (techId: string, date: Date, time: string) => ScheduleItem[];
}

/** Convert "HH:MM" to minutes-since-06:00 (the grid start) */
function timeToOffset(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h * 60 + m) - 6 * 60; // offset from 6am in minutes
}

/** Slot height in px for a duration given in minutes */
function durationToPx(minutes: number): number {
  return (minutes / 30) * ROW_HEIGHT;
}

function DayView({
  date, visibleTechs, techColorMap, selectedSlot,
  hoveredSlot, setHoveredSlot, onSlotClick, timePos, isToday,
  scrollRef, fmt12, scheduleItems
}: DayViewProps & { scheduleItems: ScheduleItem[] }) {
  const dateStr = toDateStr(date);

  // Total grid height: 06:00–20:00 = 14 hours = 28 half-hour slots
  const TOTAL_SLOTS = 28;
  const gridHeight = TOTAL_SLOTS * ROW_HEIGHT;

  function getItemColor(item: ScheduleItem, techId: string): { bg: string; border: string; text: string } {
    const color = techColorMap[techId];
    if (color) return { bg: color.bg, border: color.border, text: color.text };
    if (item.type === 'appointment') return { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800' };
    switch (item.status) {
      case 'in_progress': return { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800' };
      case 'assigned': return { bg: 'bg-yellow-100', border: 'border-yellow-400', text: 'text-yellow-800' };
      default: return { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-800' };
    }
  }

  /** Get unique busy time ranges for a tech on this day (for gap detection) */
  function getBusyRanges(techId: string): Array<{ start: number; end: number }> {
    return scheduleItems
      .filter(i => i.technician_id === techId && i.date === dateStr)
      .map(i => ({
        start: timeToOffset(i.start_time.substring(0, 5)),
        end: timeToOffset(i.end_time.substring(0, 5))
      }))
      .sort((a, b) => a.start - b.start);
  }

  /** Check if a given minute-offset is free for a tech */
  function isMinuteFree(techId: string, minuteOffset: number): boolean {
    const busy = getBusyRanges(techId);
    return !busy.some(r => minuteOffset >= r.start && minuteOffset < r.end);
  }

  if (visibleTechs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>Select technicians above to view their schedules</p>
        </div>
      </div>
    );
  }

  const colCount = visibleTechs.length;
  const TIME_COL_WIDTH = 72;
  const MIN_TECH_COL = 180;

  return (
    <div className="flex-1 overflow-auto bg-white" ref={scrollRef}>
      {/* ── Sticky tech header ── */}
      <div
        className="sticky top-0 z-20 bg-white border-b-2 border-gray-200 shadow-sm flex"
        style={{ minWidth: TIME_COL_WIDTH + colCount * MIN_TECH_COL }}
      >
        {/* Corner cell */}
        <div
          className="flex-shrink-0 bg-gray-50 border-r border-gray-200 flex items-end pb-2 px-3"
          style={{ width: TIME_COL_WIDTH }}
        >
          {isToday ? (
            <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-bold">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              Today
            </span>
          ) : (
            <span className="text-xs text-gray-400 font-medium">Time</span>
          )}
        </div>

        {/* Tech column headers */}
        {visibleTechs.map(tech => {
          const color = techColorMap[tech.id];
          const dayItems = scheduleItems.filter(i => i.technician_id === tech.id && i.date === dateStr);
          const busyMinutes = dayItems.reduce((sum, item) => {
            const s = timeToOffset(item.start_time.substring(0, 5));
            const e = timeToOffset(item.end_time.substring(0, 5));
            return sum + Math.max(0, e - s);
          }, 0);
          const freeMinutes = 14 * 60 - busyMinutes;

          return (
            <div
              key={tech.id}
              className={`flex-1 px-3 py-2.5 border-l border-gray-200 ${color?.light || 'bg-gray-50'}`}
              style={{ minWidth: MIN_TECH_COL }}
            >
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${color?.header || 'bg-gray-400'} flex-shrink-0 shadow-sm`} />
                <span className="text-sm font-bold text-gray-900 truncate">{tech.full_name}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 ml-5">
                {dayItems.length === 0 ? (
                  <span className="text-xs text-green-600 font-semibold">Free all day</span>
                ) : (
                  <>
                    <span className="text-xs text-gray-500">{dayItems.length} job{dayItems.length !== 1 ? 's' : ''}</span>
                    <span className="text-xs text-green-600 font-medium">{Math.floor(freeMinutes / 60)}h {freeMinutes % 60 > 0 ? `${freeMinutes % 60}m` : ''} open</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Main time grid ── */}
      <div
        className="relative flex"
        style={{ minWidth: TIME_COL_WIDTH + colCount * MIN_TECH_COL, height: gridHeight }}
      >
        {/* ── Time labels column ── */}
        <div
          className="flex-shrink-0 relative border-r border-gray-200 bg-gray-50"
          style={{ width: TIME_COL_WIDTH, height: gridHeight }}
        >
          {HOUR_SLOTS.map((slot, i) => (
            <div
              key={slot}
              className="absolute right-0 left-0 flex justify-end pr-2"
              style={{ top: i * ROW_HEIGHT * 2, height: ROW_HEIGHT * 2 }}
            >
              <span className="text-xs font-semibold text-gray-500 mt-1">{fmt12(slot)}</span>
            </div>
          ))}
          {/* Half-hour ticks */}
          {HOUR_SLOTS.map((_, i) => (
            <div
              key={`half-${i}`}
              className="absolute right-0 left-0 border-t border-gray-100 flex justify-end pr-2"
              style={{ top: i * ROW_HEIGHT * 2 + ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              <span className="text-[10px] text-gray-300 mt-0.5">:30</span>
            </div>
          ))}
          {/* Hour lines */}
          {HOUR_SLOTS.map((_, i) => (
            <div
              key={`hr-${i}`}
              className="absolute left-0 right-0 border-t border-gray-200"
              style={{ top: i * ROW_HEIGHT * 2 }}
            />
          ))}
        </div>

        {/* ── Tech columns ── */}
        {visibleTechs.map((tech, colIdx) => {
          const color = techColorMap[tech.id];
          const dayItems = scheduleItems.filter(i => i.technician_id === tech.id && i.date === dateStr);

          // Build free blocks between busy ranges for this tech
          const busyRanges = getBusyRanges(tech.id);
          const freeBlocks: Array<{ start: number; end: number }> = [];
          let cursor = 0; // minutes from 6am
          const totalMinutes = 14 * 60;
          for (const busy of busyRanges) {
            if (busy.start > cursor) freeBlocks.push({ start: cursor, end: busy.start });
            cursor = Math.max(cursor, busy.end);
          }
          if (cursor < totalMinutes) freeBlocks.push({ start: cursor, end: totalMinutes });

          return (
            <div
              key={tech.id}
              className="flex-1 relative border-l border-gray-200"
              style={{ minWidth: MIN_TECH_COL, height: gridHeight }}
            >
              {/* Hour grid lines */}
              {HOUR_SLOTS.map((_, i) => (
                <div key={i}>
                  <div className="absolute left-0 right-0 border-t border-gray-200" style={{ top: i * ROW_HEIGHT * 2 }} />
                  <div className="absolute left-0 right-0 border-t border-dashed border-gray-100" style={{ top: i * ROW_HEIGHT * 2 + ROW_HEIGHT }} />
                </div>
              ))}

              {/* ── Free/Open blocks — always visible ── */}
              {freeBlocks.map((block, bi) => {
                const top = durationToPx(block.start);
                const height = durationToPx(block.end - block.start);
                if (height < ROW_HEIGHT / 2) return null; // skip tiny slivers

                const isSelected = selectedSlot?.techId === tech.id
                  && selectedSlot?.date === dateStr
                  && timeToOffset(selectedSlot.startTime) >= block.start
                  && timeToOffset(selectedSlot.startTime) < block.end;

                const startHHMM = minuteOffsetToTime(block.start);
                const endHHMM = minuteOffsetToTime(block.end);

                return (
                  <div
                    key={bi}
                    className={`absolute left-0.5 right-0.5 rounded-md cursor-pointer transition-all duration-150 group overflow-hidden
                      ${isSelected
                        ? 'bg-green-100 border-2 border-green-400 shadow-md'
                        : colIdx % 2 === 0
                          ? 'bg-slate-50 border border-slate-200 hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm'
                          : 'bg-white border border-gray-100 hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm'
                      }`}
                    style={{ top: top + 1, height: height - 2 }}
                    onClick={() => {
                      // Click anywhere in a free block: pick the half-hour that was clicked
                      onSlotClick(tech.id, date, startHHMM);
                    }}
                    onMouseEnter={() => setHoveredSlot({ techId: tech.id, date: dateStr, time: startHHMM })}
                    onMouseLeave={() => setHoveredSlot(null)}
                    title={`Available: ${fmt12(startHHMM)} – ${fmt12(endHHMM)}\nClick to select ${tech.full_name} for this time`}
                  >
                    {/* Free block label */}
                    <div className={`flex flex-col justify-start p-1.5 h-full ${isSelected ? 'text-green-700' : 'text-gray-400 group-hover:text-blue-600'}`}>
                      {isSelected ? (
                        <>
                          <div className="flex items-center gap-1 font-bold text-xs text-green-700">
                            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            Selected
                          </div>
                          <div className="text-[11px] font-semibold text-green-600 mt-0.5">
                            {fmt12(selectedSlot!.startTime)} – {fmt12(selectedSlot!.endTime)}
                          </div>
                        </>
                      ) : height >= ROW_HEIGHT * 2 ? (
                        <>
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-green-500 group-hover:text-blue-600 transition-colors">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 group-hover:bg-blue-400" />
                            Open
                          </div>
                          <div className="text-[10px] mt-0.5 font-medium text-gray-400 group-hover:text-blue-500">
                            {fmt12(startHHMM)} – {fmt12(endHHMM)}
                          </div>
                          <div className="text-[10px] text-gray-300 group-hover:text-blue-400 mt-0.5">
                            {block.end - block.start >= 60
                              ? `${(block.end - block.start) / 60}h available`
                              : `${block.end - block.start}m available`}
                          </div>
                          <div className="mt-auto mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1 bg-blue-500 text-white rounded px-1.5 py-0.5 w-fit text-[10px] font-semibold shadow-sm">
                              <span>+ Schedule here</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-1 text-[10px] font-medium text-green-500 group-hover:text-blue-600">
                          <div className="w-1 h-1 rounded-full bg-green-400 group-hover:bg-blue-400" />
                          {fmt12(startHHMM)}
                          <span className="opacity-0 group-hover:opacity-100 ml-1 text-blue-500">+</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* ── Busy/Scheduled blocks ── */}
              {dayItems.map(item => {
                const startOff = timeToOffset(item.start_time.substring(0, 5));
                const endOff = timeToOffset(item.end_time.substring(0, 5));
                const top = durationToPx(startOff);
                const height = Math.max(durationToPx(endOff - startOff), ROW_HEIGHT);
                const c = getItemColor(item, tech.id);

                return (
                  <div
                    key={item.id}
                    className={`absolute left-0.5 right-0.5 rounded-md border-l-4 shadow-sm z-10 overflow-hidden ${c.bg} ${c.border} ${c.text}`}
                    style={{ top: top + 1, height: height - 2 }}
                    title={`${item.title}\n${item.customer_name || ''}\n${fmt12(item.start_time)} – ${fmt12(item.end_time)}\nStatus: ${item.status}`}
                  >
                    <div className="p-1.5 h-full flex flex-col">
                      <div className="flex items-start gap-1">
                        {item.priority === 'urgent' && <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />}
                        <span className="text-xs font-bold leading-tight line-clamp-2">{item.title}</span>
                      </div>
                      {item.customer_name && (
                        <div className="text-[10px] opacity-75 truncate mt-0.5">{item.customer_name}</div>
                      )}
                      <div className="flex items-center gap-1 text-[10px] opacity-60 mt-auto">
                        <Clock className="w-2.5 h-2.5" />
                        {fmt12(item.start_time)} – {fmt12(item.end_time)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Selected slot overlay (when user clicked within a free block) */}
              {selectedSlot?.techId === tech.id && selectedSlot?.date === dateStr && (() => {
                const startOff = timeToOffset(selectedSlot.startTime);
                const endOff = timeToOffset(selectedSlot.endTime);
                if (!isMinuteFree(tech.id, startOff)) return null;
                const top = durationToPx(startOff);
                const height = durationToPx(endOff - startOff);
                return (
                  <div
                    key="selected"
                    className="absolute left-0.5 right-0.5 rounded-md z-20 bg-green-200 border-2 border-green-500 shadow-lg pointer-events-none"
                    style={{ top: top + 1, height: height - 2 }}
                  >
                    <div className="p-1.5 flex flex-col items-start">
                      <div className="flex items-center gap-1 text-green-800 font-bold text-xs">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Selected
                      </div>
                      <div className="text-[11px] text-green-700 font-semibold mt-0.5">
                        {fmt12(selectedSlot.startTime)} – {fmt12(selectedSlot.endTime)}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}

        {/* ── Current time red line ── */}
        {isToday && timePos >= 0 && (
          <div
            className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
            style={{ top: `${timePos}%` }}
          >
            <div className="flex-shrink-0 flex justify-end pr-1" style={{ width: TIME_COL_WIDTH }}>
              <div className="w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg -mr-1.5" />
            </div>
            <div className="flex-1 h-0.5 bg-red-500 shadow-md" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Convert minute offset from 6am to "HH:MM" string */
function minuteOffsetToTime(offset: number): string {
  const totalMinutes = 6 * 60 + offset;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/* ── Week View Component ── */
interface WeekViewProps {
  days: Date[];
  visibleTechs: Technician[];
  scheduleItems: ScheduleItem[];
  techColorMap: Record<string, typeof TECH_COLORS[0]>;
  selectedSlot: { techId: string; date: string; startTime: string; endTime: string } | null;
  onSlotClick: (techId: string, date: Date, time: string) => void;
  onDayClick: (d: Date) => void;
  isToday: (d: Date) => boolean;
  getWorkloadForDay: (techId: string, date: Date) => { count: number; hours: number };
  fmt12: (t: string) => string;
  toDateStr: (d: Date) => string;
}

function WeekView({ days, visibleTechs, scheduleItems, techColorMap, onDayClick, isToday, getWorkloadForDay, toDateStr }: WeekViewProps) {
  if (visibleTechs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <Calendar className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>Select technicians above to view their schedules</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse min-w-[700px]">
        <thead className="sticky top-0 z-10 bg-white shadow-sm">
          <tr>
            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 border-b border-r border-gray-200 bg-gray-50 w-40">
              Technician
            </th>
            {days.map((day, i) => {
              const today = isToday(day);
              return (
                <th
                  key={i}
                  className={`px-3 py-3 text-center text-xs border-b border-l border-gray-200 cursor-pointer hover:bg-blue-50 transition-colors ${today ? 'bg-blue-50' : 'bg-gray-50'}`}
                  onClick={() => onDayClick(day)}
                  title="Click for hourly view"
                >
                  <div className={`font-semibold ${today ? 'text-blue-700' : 'text-gray-600'}`}>
                    {DAYS_SHORT[day.getDay()]}
                  </div>
                  <div className={`text-base font-bold mt-0.5 ${today ? 'text-blue-600' : 'text-gray-900'}`}>
                    {day.getDate()}
                  </div>
                  <div className={`text-[10px] mt-0.5 font-medium ${today ? 'text-blue-500' : 'text-gray-400'}`}>
                    {day.toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                  {today && <div className="text-[10px] text-blue-500 font-bold">TODAY</div>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visibleTechs.map(tech => {
            const color = techColorMap[tech.id];
            return (
              <tr key={tech.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                <td className={`px-3 py-3 border-r border-gray-200 ${color?.light || 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${color?.header || 'bg-gray-400'} flex-shrink-0`} />
                    <div>
                      <div className="text-sm font-semibold text-gray-900 truncate">{tech.full_name}</div>
                    </div>
                  </div>
                </td>
                {days.map((day, i) => {
                  const dateStr = toDateStr(day);
                  const { count, hours } = getWorkloadForDay(tech.id, day);
                  const dayItems = scheduleItems.filter(item => item.technician_id === tech.id && item.date === dateStr);
                  const today = isToday(day);

                  return (
                    <td
                      key={i}
                      className={`px-2 py-2 border-l border-gray-100 align-top cursor-pointer hover:bg-blue-50 transition-colors ${today ? 'bg-blue-50/30' : ''}`}
                      onClick={() => onDayClick(day)}
                      title="Click for hourly view"
                    >
                      {count === 0 ? (
                        <div className="h-14 flex flex-col items-center justify-center gap-1">
                          <span className="text-xs text-green-600 font-semibold">Free</span>
                          <div className="text-[10px] text-blue-400 font-medium opacity-70">Click to view</div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className={`text-[10px] font-bold ${color?.text || 'text-gray-700'} mb-1`}>
                            {count} job{count !== 1 ? 's' : ''} · {hours}h
                          </div>
                          {dayItems.slice(0, 3).map(item => (
                            <div
                              key={item.id}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${color?.bg || 'bg-gray-100'} ${color?.text || 'text-gray-700'} truncate font-medium`}
                              title={item.title}
                            >
                              {item.title}
                            </div>
                          ))}
                          {dayItems.length > 3 && (
                            <div className="text-[10px] text-gray-400 italic">+{dayItems.length - 3} more</div>
                          )}
                        </div>
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
  );
}
