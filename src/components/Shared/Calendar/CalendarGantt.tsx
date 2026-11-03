import { minutes, timeLabel } from '../../../lib/workOrderScheduling';
import { CALENDAR_EVENT_STYLES } from './calendarStyles';
import type { CalendarGridEvent } from './CalendarTimeGrid';
export interface CalendarGanttEvent extends CalendarGridEvent { date: string; technicianId: string }
const DAY_WIDTH = 160;
export function CalendarGantt({ dates, tracks, events, onDateSelect, onEventSelect, onEventDrop, loading, error, onRetry }: {
  dates: string[]; tracks: { id: string; label: string }[]; events: CalendarGanttEvent[];
  onDateSelect: (date: string, technicianId: string) => void;
  onEventSelect?: (event: CalendarGanttEvent) => void; onEventDrop?: (date: string, technicianId: string) => void;
  loading?: boolean; error?: string | null; onRetry?: () => void;
}) {
  return <div className="relative max-h-[min(600px,65dvh)] overflow-auto rounded-lg border border-gray-200 bg-white text-gray-900" aria-busy={loading} data-calendar-gantt>
    <div style={{ minWidth: 180 + dates.length * DAY_WIDTH }}>
      <div className="flex sticky top-0 z-30 bg-white border-b border-gray-200"><div className="sticky left-0 w-[180px] shrink-0 bg-white px-3 py-3 text-xs font-semibold">Schedule</div>{dates.map(date => <div key={date} style={{ width: DAY_WIDTH }} className="shrink-0 border-l border-gray-200 py-3 text-center text-xs font-semibold">{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>)}</div>
      {tracks.map(track => {
        const items = events.filter(event => event.technicianId === track.id && dates.includes(event.date)).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
        const height = Math.max(72, 34 + items.length * 36);
        return <div key={track.id} className="flex border-b border-gray-200" style={{ height }}>
          <div className="sticky left-0 z-20 w-[180px] shrink-0 bg-white border-r border-gray-200 px-3 py-2"><div className="text-xs font-semibold truncate">{track.label}</div>{items.map(event => <button key={event.id} type="button" onClick={() => onEventSelect ? onEventSelect(event) : onDateSelect(event.date, track.id)} title={event.title} className="h-9 block w-full truncate text-left text-[11px] hover:text-blue-700">{event.title}</button>)}</div>
          <div className="relative flex" style={{ width: dates.length * DAY_WIDTH }}>
            {dates.map(date => <button type="button" key={date} aria-label={'View ' + track.label + ' on ' + date} onClick={() => onDateSelect(date, track.id)} style={{ width: DAY_WIDTH }} className="shrink-0 border-r border-gray-100 hover:bg-blue-50" onDragOver={e => { if (onEventDrop) e.preventDefault(); }} onDrop={e => { e.preventDefault(); onEventDrop?.(date, track.id); }} />)}
            {items.map((event, i) => {
              const start = event.allDay ? 0 : minutes(event.start), duration = event.allDay ? 1440 : Math.max(30, minutes(event.end) - start);
              return <div key={event.id} draggable={event.draggable} onDragStart={e => { e.dataTransfer.setData('text/plain', event.id); e.dataTransfer.effectAllowed = 'move'; event.onDragStart?.(e); }} onDragEnd={event.onDragEnd} title={event.title + ' · ' + event.date + ' · ' + (event.allDay ? 'All day' : timeLabel(event.start) + ' – ' + timeLabel(event.end))} onClick={() => onEventSelect?.(event)}
                style={{ left: (dates.indexOf(event.date) + start / 1440) * DAY_WIDTH, top: 30 + i * 36, width: Math.max(8, duration / 1440 * DAY_WIDTH) }} className={'absolute h-7 rounded border-l-2 overflow-hidden cursor-pointer ' + Object.values(CALENDAR_EVENT_STYLES[event.kind]).join(' ')} />;
            })}
          </div>
        </div>;
      })}
      {!tracks.length && <p className="p-6 text-sm text-gray-500">No technicians to display.</p>}
    </div>
    {(loading || error) && <div className="absolute inset-0 z-30 bg-white/90 flex justify-center pt-10"><div role={error ? 'alert' : 'status'} className="p-4 text-sm text-gray-700 text-center">{error || 'Loading availability…'}{error && onRetry && <button type="button" onClick={onRetry} className="block mx-auto mt-3 min-h-11 px-4 bg-blue-600 text-white rounded-lg">Retry</button>}</div></div>}
  </div>;
}
