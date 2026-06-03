import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, Clock, User } from 'lucide-react';

interface SchedulingCalendarProps {
  technicianIds: string[];
  selectedDate: string;
  selectedTime?: string;
  onSlotSelect: (date: string, startTime: string) => void;
  estimatedHours?: number;
}

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
}

interface TechInfo {
  id: string;
  full_name: string;
}

interface TimeOffEntry {
  user_id: string;
  start_date: string;
  end_date: string;
}

const HOUR_START = 6;
const HOUR_END = 21;
const TOTAL_HOURS = HOUR_END - HOUR_START;
const SLOT_HEIGHT = 56;

const TECH_COLORS = [
  { bg: 'bg-sky-500', light: 'bg-sky-100', border: 'border-sky-400', text: 'text-sky-700', dot: 'bg-sky-500' },
  { bg: 'bg-emerald-500', light: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-500', light: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', dot: 'bg-amber-500' },
  { bg: 'bg-rose-500', light: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-700', dot: 'bg-rose-500' },
  { bg: 'bg-violet-500', light: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-700', dot: 'bg-violet-500' },
  { bg: 'bg-teal-500', light: 'bg-teal-100', border: 'border-teal-400', text: 'text-teal-700', dot: 'bg-teal-500' },
];

function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function getWeekDays(anchor: Date): Date[] {
  const start = new Date(anchor);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function SchedulingCalendar({
  technicianIds,
  selectedDate,
  selectedTime,
  onSlotSelect,
  estimatedHours = 2,
}: SchedulingCalendarProps) {
  const today = new Date();
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [anchor, setAnchor] = useState<Date>(() => {
    if (selectedDate) {
      const d = new Date(selectedDate + 'T12:00:00');
      return d;
    }
    return today;
  });
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffEntry[]>([]);
  const [techs, setTechs] = useState<TechInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredSlot, setHoveredSlot] = useState<{ date: string; hour: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ event: ScheduleEvent; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const weekDays = getViewDays();
  const techColorMap: Record<string, typeof TECH_COLORS[0]> = {};
  technicianIds.forEach((id, i) => {
    techColorMap[id] = TECH_COLORS[i % TECH_COLORS.length];
  });

  function getViewDays(): Date[] {
    if (viewMode === 'day') return [anchor];
    return getWeekDays(anchor);
  }

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (selectedDate) {
      setAnchor(new Date(selectedDate + 'T12:00:00'));
    }
  }, [selectedDate]);

  useEffect(() => {
    loadTechs();
  }, [technicianIds]);

  useEffect(() => {
    loadData();
  }, [technicianIds, anchor, viewMode]);

  useEffect(() => {
    if (scrollRef.current) {
      const nowHour = today.getHours();
      const clampedHour = Math.max(HOUR_START, Math.min(HOUR_END - 1, nowHour - 1));
      scrollRef.current.scrollTop = (clampedHour - HOUR_START) * SLOT_HEIGHT;
    }
  }, []);

  async function loadTechs() {
    if (technicianIds.length === 0) { setTechs([]); return; }
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', technicianIds);
    if (data) {
      const ordered = technicianIds.map(id => data.find(t => t.id === id)).filter(Boolean) as TechInfo[];
      setTechs(ordered);
    }
  }

  async function loadData() {
    if (technicianIds.length === 0) { setEvents([]); setTimeOff([]); return; }
    setLoading(true);
    try {
      const days = getViewDays();
      const start = dateStr(days[0]);
      const end = dateStr(days[days.length - 1]);

      const [woRes, aptRes, ptoRes] = await Promise.all([
        supabase.from('work_orders').select(`
          id, title, start_date, scheduled_start_time, estimated_hours, status, priority, assigned_to,
          contacts(full_name, company_name)
        `).in('assigned_to', technicianIds)
          .gte('start_date', start).lte('start_date', end)
          .not('status', 'in', '("completed","cancelled","archived")'),

        supabase.from('appointments').select(`
          id, title, appointment_date, start_time, end_time, status, assigned_technician,
          contacts(full_name, company_name)
        `).in('assigned_technician', technicianIds)
          .gte('appointment_date', start).lte('appointment_date', end)
          .not('status', 'eq', 'cancelled'),

        supabase.from('pto_requests').select('employee_id, start_date, end_date, status')
          .in('employee_id', technicianIds).eq('status', 'approved')
          .lte('start_date', end).gte('end_date', start),
      ]);

      const workOrderEvents: ScheduleEvent[] = (woRes.data || []).map((wo: any) => {
        const startT = wo.scheduled_start_time || '08:00';
        const hours = wo.estimated_hours || 2;
        const startMin = toMinutes(startT);
        const endMin = startMin + hours * 60;
        const endH = Math.floor(endMin / 60);
        const endM = endMin % 60;
        const endT = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
        return {
          id: wo.id,
          title: wo.title,
          date: wo.start_date,
          start_time: startT,
          end_time: endT,
          type: 'work_order',
          status: wo.status,
          technician_id: wo.assigned_to,
          customer_name: wo.contacts?.full_name || wo.contacts?.company_name,
          priority: wo.priority,
        };
      });

      const appointmentEvents: ScheduleEvent[] = (aptRes.data || []).map((apt: any) => ({
        id: apt.id,
        title: apt.title,
        date: apt.appointment_date,
        start_time: apt.start_time || '09:00',
        end_time: apt.end_time || '10:00',
        type: 'appointment',
        status: apt.status,
        technician_id: apt.assigned_technician,
        customer_name: apt.contacts?.full_name || apt.contacts?.company_name,
      }));

      setEvents([...workOrderEvents, ...appointmentEvents]);
      setTimeOff((ptoRes.data || []).map((r: any) => ({ user_id: r.employee_id, start_date: r.start_date, end_date: r.end_date })));
    } catch (e) {
      console.error('SchedulingCalendar load error', e);
    } finally {
      setLoading(false);
    }
  }

  function isTechOnTimeOff(techId: string, day: Date): boolean {
    const ds = dateStr(day);
    return timeOff.some(t => t.user_id === techId && ds >= t.start_date && ds <= t.end_date);
  }

  function getEventsForDayTech(day: Date, techId: string): ScheduleEvent[] {
    return events.filter(e => e.date === dateStr(day) && e.technician_id === techId);
  }

  function eventTopPercent(event: ScheduleEvent): number {
    const startMin = toMinutes(event.start_time) - HOUR_START * 60;
    return (startMin / (TOTAL_HOURS * 60)) * 100;
  }

  function eventHeightPercent(event: ScheduleEvent): number {
    const durMin = toMinutes(event.end_time) - toMinutes(event.start_time);
    return Math.max((durMin / (TOTAL_HOURS * 60)) * 100, (30 / (TOTAL_HOURS * 60)) * 100);
  }

  function currentTimeTop(): number {
    const nowMin = currentTime.getHours() * 60 + currentTime.getMinutes() - HOUR_START * 60;
    return (nowMin / (TOTAL_HOURS * 60)) * 100;
  }

  function handleSlotClick(day: Date, hour: number, techId: string) {
    const ds = dateStr(day);
    const time = `${hour.toString().padStart(2, '0')}:00`;
    onSlotSelect(ds, time);
  }

  function isSelectedSlot(day: Date, hour: number): boolean {
    if (!selectedDate || !selectedTime) return false;
    const ds = dateStr(day);
    if (ds !== selectedDate) return false;
    const slotStart = hour;
    const selectedH = parseInt(selectedTime.split(':')[0], 10);
    const endH = selectedH + Math.ceil(estimatedHours);
    return hour >= selectedH && hour < endH;
  }

  function navigate(dir: 1 | -1) {
    const d = new Date(anchor);
    if (viewMode === 'day') d.setDate(d.getDate() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setAnchor(d);
  }

  function headerLabel(): string {
    const days = getViewDays();
    if (viewMode === 'day') {
      return anchor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    const first = days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const last = days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${first} – ${last}`;
  }

  function getTechDayStatus(techId: string, day: Date): 'off' | 'free' | 'light' | 'busy' {
    if (isTechOnTimeOff(techId, day)) return 'off';
    const count = getEventsForDayTech(day, techId).length;
    if (count === 0) return 'free';
    if (count <= 2) return 'light';
    return 'busy';
  }

  const totalMinutes = TOTAL_HOURS * 60;
  const totalHeight = TOTAL_HOURS * SLOT_HEIGHT;
  const viewDays = getViewDays();
  const isToday = (d: Date) => isSameDay(d, today);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => { setAnchor(today); if (!selectedDate) onSlotSelect(dateStr(today), '08:00'); }}
            className="px-2.5 py-1 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <span className="text-sm font-semibold text-white truncate mx-2">{headerLabel()}</span>

        <div className="flex items-center gap-1 bg-gray-700 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'week' ? 'bg-orange-600 text-white shadow' : 'text-gray-300 hover:text-white hover:bg-gray-600'
            }`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setViewMode('day')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'day' ? 'bg-orange-600 text-white shadow' : 'text-gray-300 hover:text-white hover:bg-gray-600'
            }`}
          >
            Day
          </button>
        </div>
      </div>

      {/* Column headers: days */}
      <div
        className="grid shrink-0 bg-gray-800 border-b border-gray-700"
        style={{ gridTemplateColumns: `48px repeat(${viewDays.length * (technicianIds.length || 1)}, 1fr)` }}
      >
        <div className="border-r border-gray-700" />
        {viewDays.map((day, di) => {
          const todayMark = isToday(day);
          const ds = dateStr(day);
          const isSelectedDay = ds === selectedDate;
          return (
            <div
              key={di}
              className={`col-span-${technicianIds.length || 1} px-1 py-2 text-center border-r border-gray-700 ${
                isSelectedDay ? 'bg-orange-900/30' : todayMark ? 'bg-blue-900/20' : ''
              }`}
              style={{ gridColumn: `span ${technicianIds.length || 1}` }}
            >
              <div className={`text-xs font-medium ${todayMark ? 'text-blue-400' : 'text-gray-400'}`}>
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div
                className={`text-lg font-bold mt-0.5 w-8 h-8 flex items-center justify-center rounded-full mx-auto cursor-pointer transition-colors ${
                  isSelectedDay ? 'bg-orange-600 text-white' :
                  todayMark ? 'bg-blue-600 text-white' :
                  'text-white hover:bg-gray-700'
                }`}
                onClick={() => { setAnchor(day); setViewMode('day'); }}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tech headers row (when multiple techs) */}
      {technicianIds.length > 1 && (
        <div
          className="grid shrink-0 bg-gray-800/80 border-b border-gray-700"
          style={{ gridTemplateColumns: `48px repeat(${viewDays.length * technicianIds.length}, 1fr)` }}
        >
          <div className="border-r border-gray-700" />
          {viewDays.map((day, di) =>
            techs.map((tech, ti) => {
              const color = techColorMap[tech.id];
              const status = getTechDayStatus(tech.id, day);
              return (
                <div
                  key={`${di}-${ti}`}
                  className="px-1 py-1.5 text-center border-r border-gray-700/50 border-l"
                >
                  <div className="flex items-center justify-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      status === 'off' ? 'bg-red-500' :
                      status === 'free' ? 'bg-green-500' :
                      status === 'light' ? 'bg-yellow-500' :
                      'bg-orange-500'
                    }`} />
                    <span className={`text-[10px] font-medium truncate max-w-[60px] ${color?.text || 'text-gray-400'}`}>
                      {tech.full_name.split(' ')[0]}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `48px repeat(${viewDays.length * Math.max(technicianIds.length, 1)}, 1fr)`,
              height: `${totalHeight}px`,
            }}
          >
            {/* Hour labels */}
            <div className="relative border-r border-gray-700 bg-gray-900/50">
              {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <div
                  key={i}
                  className="absolute right-2 flex items-start"
                  style={{ top: `${i * SLOT_HEIGHT}px`, height: `${SLOT_HEIGHT}px` }}
                >
                  <span className="text-[10px] text-gray-500 font-medium -mt-2 whitespace-nowrap">
                    {formatTime12(`${(HOUR_START + i).toString().padStart(2, '0')}:00`)}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {viewDays.map((day, di) => {
              const techList = technicianIds.length > 0 ? techs : [{ id: '__none__', full_name: '' }];
              return techList.map((tech, ti) => {
                const colEvents = technicianIds.length > 0
                  ? getEventsForDayTech(day, tech.id)
                  : [];
                const onTimeOff = technicianIds.length > 0 && isTechOnTimeOff(tech.id, day);
                const color = techColorMap[tech.id];
                const isSelectedDay = dateStr(day) === selectedDate;
                const colIndex = di * techList.length + ti;
                const isLastCol = colIndex === viewDays.length * techList.length - 1;

                return (
                  <div
                    key={`${di}-${ti}`}
                    className={`relative ${isLastCol ? '' : 'border-r'} border-gray-700/50 ${
                      isSelectedDay ? 'bg-orange-900/10' : ''
                    }`}
                    style={{ height: `${totalHeight}px` }}
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

                    {/* Time-off overlay */}
                    {onTimeOff && (
                      <div className="absolute inset-0 bg-red-500/10 z-0 flex items-center justify-center pointer-events-none">
                        <div className="rotate-[-20deg] text-red-400/30 font-bold text-xl select-none">TIME OFF</div>
                      </div>
                    )}

                    {/* Clickable hour slots */}
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => {
                      const hour = HOUR_START + i;
                      const isHighlighted = isSelectedSlot(day, hour);
                      const isHovered = hoveredSlot?.date === dateStr(day) && hoveredSlot?.hour === hour;

                      return (
                        <div
                          key={`slot-${i}`}
                          className={`absolute w-full cursor-pointer transition-colors ${
                            isHighlighted
                              ? 'bg-orange-500/25 border-l-2 border-orange-400'
                              : isHovered
                              ? 'bg-white/5'
                              : 'hover:bg-white/5'
                          }`}
                          style={{ top: `${i * SLOT_HEIGHT}px`, height: `${SLOT_HEIGHT}px`, zIndex: 1 }}
                          onClick={() => handleSlotClick(day, hour, tech.id)}
                          onMouseEnter={() => setHoveredSlot({ date: dateStr(day), hour })}
                          onMouseLeave={() => setHoveredSlot(null)}
                        >
                          {isHovered && !isHighlighted && (
                            <div className="absolute left-1 top-1 text-[10px] text-gray-400 flex items-center gap-0.5 pointer-events-none">
                              <Clock className="w-2.5 h-2.5" />
                              {formatTime12(`${hour.toString().padStart(2, '0')}:00`)}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Events */}
                    {colEvents.map(event => {
                      const topPct = eventTopPercent(event);
                      const heightPct = eventHeightPercent(event);
                      const topPx = (topPct / 100) * totalHeight;
                      const heightPx = Math.max((heightPct / 100) * totalHeight, 24);
                      const eventColor = color || TECH_COLORS[0];
                      const isWO = event.type === 'work_order';

                      return (
                        <div
                          key={event.id}
                          className={`absolute left-0.5 right-0.5 rounded overflow-hidden cursor-pointer transition-opacity hover:opacity-90 z-10 ${
                            eventColor.light
                          } border-l-2 ${eventColor.border}`}
                          style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTooltip({ event, x: e.clientX, y: e.clientY });
                          }}
                        >
                          <div className="px-1 py-0.5 h-full overflow-hidden">
                            <div className={`text-[10px] font-semibold truncate leading-tight ${eventColor.text}`}>
                              {isWO ? '⚙' : '📅'} {event.title}
                            </div>
                            {heightPx > 36 && event.customer_name && (
                              <div className={`text-[9px] truncate ${eventColor.text} opacity-80`}>
                                {event.customer_name}
                              </div>
                            )}
                            {heightPx > 50 && (
                              <div className={`text-[9px] ${eventColor.text} opacity-70`}>
                                {formatTime12(event.start_time)}–{formatTime12(event.end_time)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Current time indicator */}
                    {isToday(day) && currentTime.getHours() >= HOUR_START && currentTime.getHours() < HOUR_END && (
                      <div
                        className="absolute left-0 right-0 z-20 pointer-events-none"
                        style={{ top: `${(currentTimeTop() / 100) * totalHeight}px` }}
                      >
                        <div className="relative">
                          <div className="absolute -left-0.5 -top-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                          <div className="border-t-2 border-red-500 w-full" />
                        </div>
                      </div>
                    )}

                    {/* Selected time indicator */}
                    {selectedDate === dateStr(day) && selectedTime && (
                      <div
                        className="absolute left-0 right-0 z-20 pointer-events-none"
                        style={{ top: `${((toMinutes(selectedTime) - HOUR_START * 60) / (TOTAL_HOURS * 60)) * totalHeight}px` }}
                      >
                        <div className="relative">
                          <div className="absolute -left-0.5 -top-1 w-2.5 h-2.5 rounded-full bg-orange-400" />
                          <div className="border-t-2 border-orange-400 border-dashed w-full" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })}
          </div>
        )}
      </div>

      {/* Bottom legend */}
      {technicianIds.length > 0 && (
        <div className="shrink-0 px-3 py-2 bg-gray-800 border-t border-gray-700">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {techs.map(tech => {
              const color = techColorMap[tech.id];
              return (
                <div key={tech.id} className="flex items-center gap-1">
                  <div className={`w-3 h-2 rounded-sm ${color?.bg || 'bg-gray-500'}`} />
                  <span className="text-[10px] text-gray-400 truncate max-w-[80px]">{tech.full_name}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-1 ml-auto">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[10px] text-gray-400">Time Off</span>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip overlay */}
      {tooltip && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setTooltip(null)} />
          <div
            className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3 min-w-[200px] max-w-[240px]"
            style={{
              left: Math.min(tooltip.x + 8, window.innerWidth - 250),
              top: Math.min(tooltip.y + 8, window.innerHeight - 150),
            }}
          >
            <div className="font-semibold text-white text-sm mb-1">{tooltip.event.title}</div>
            {tooltip.event.customer_name && (
              <div className="flex items-center gap-1 text-xs text-gray-300 mb-1">
                <User className="w-3 h-3" />
                {tooltip.event.customer_name}
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-gray-300">
              <Clock className="w-3 h-3" />
              {formatTime12(tooltip.event.start_time)} – {formatTime12(tooltip.event.end_time)}
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                tooltip.event.type === 'work_order' ? 'bg-blue-900/50 text-blue-300' : 'bg-green-900/50 text-green-300'
              }`}>
                {tooltip.event.type === 'work_order' ? 'Work Order' : 'Appointment'}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                tooltip.event.status === 'in_progress' ? 'bg-amber-900/50 text-amber-300' :
                tooltip.event.status === 'scheduled' ? 'bg-sky-900/50 text-sky-300' :
                'bg-gray-700 text-gray-300'
              }`}>
                {tooltip.event.status}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
