export interface ScheduleSelection { date: string; start: string; end: string }
export interface CalendarBooking {
  id: string; technicianId: string; date: string; start: string; end: string;
  title: string; kind: 'work_order' | 'appointment' | 'time_off'; canMove?: boolean;
}
export function dateKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
export function addDays(date: string, count: number): string {
  const result = new Date(date + 'T12:00:00');
  result.setDate(result.getDate() + count);
  return dateKey(result);
}
export function weekDates(date: string): string[] {
  const day = new Date(date + 'T12:00:00').getDay();
  const monday = addDays(date, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
export function minutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}
export function timeKey(value: number): string {
  return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
}
export function timeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM');
}
export function selectionDuration(selection: ScheduleSelection): number {
  const duration = minutes(selection.end) - minutes(selection.start);
  return Number.isFinite(duration) && duration > 0 ? duration : 60;
}
export function schedulingError(selection: ScheduleSelection): string | null {
  if (!selection.start || !selection.end) return null;
  if (!/^\d{2}:\d{2}$/.test(selection.start) || !/^\d{2}:\d{2}$/.test(selection.end) ||
      minutes(selection.start) < 0 || minutes(selection.end) >= 1440 || minutes(selection.end) <= minutes(selection.start)) {
    return 'End time must be after start time on the same day.';
  }
  return null;
}
export function overlappingBookings(bookings: CalendarBooking[], technicianIds: string[], selection: ScheduleSelection): CalendarBooking[] {
  if (!selection.date || !selection.start || !selection.end) return [];
  return bookings.filter(item => technicianIds.includes(item.technicianId) && item.date === selection.date &&
    minutes(selection.start) < minutes(item.end) && minutes(selection.end) > minutes(item.start));
}

// A calendar must not call unreturned bookings "free" when a result spans API pages.
export async function loadCalendarPages<T>(query: {
  range: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>;
}): Promise<{ data: T[]; error: null }> {
  const rows: T[] = [];
  for (;;) {
    const result = await query.range(rows.length, rows.length + 499);
    if (result.error) throw result.error;
    if (!result.data) throw new Error('Availability results were not returned.');
    rows.push(...result.data);
    if (result.count != null ? rows.length >= result.count : result.data.length < 500) return { data: rows, error: null };
    if (!result.data.length) throw new Error('Availability results were incomplete.');
  }
}

export function monthDates(date: string): string[] {
  const first = date.slice(0, 8) + '01';
  const start = weekDates(first)[0];
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function calendarPeriodDays(view: string): number { return view === 'gantt' ? 14 : view === 'week' ? 7 : 1; }
