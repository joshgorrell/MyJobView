import { monthDates } from '../../../lib/workOrderScheduling';
import { CALENDAR_EVENT_STYLES } from './calendarStyles';
import type { CalendarGridEvent } from './CalendarTimeGrid';
export interface CalendarMonthEvent extends CalendarGridEvent { date: string }
export function CalendarMonthGrid({ date, events, onDateSelect, onEventSelect, onEventDrop, loading, error, onRetry }: {
  date: string; events: CalendarMonthEvent[]; onDateSelect: (date: string) => void;
  onEventSelect?: (event: CalendarMonthEvent) => void; onEventDrop?: (date: string) => void;
  loading?: boolean; error?: string | null; onRetry?: () => void;
}) {
  return <div className="relative overflow-auto rounded-lg border border-gray-200 bg-white text-gray-900" aria-busy={loading} data-calendar-month-grid>
    <div className="min-w-[560px]">
      <div className="grid grid-cols-7 border-b border-gray-200">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="py-3 text-center text-xs font-semibold">{day}</div>)}</div>
      <div className="grid grid-cols-7">{monthDates(date).map(day => <div key={day} className={'min-h-28 p-1 border-b border-r border-gray-100 ' + (day.slice(0, 7) === date.slice(0, 7) ? '' : 'bg-gray-50 text-gray-400')}
        onDragOver={e => { if (onEventDrop) e.preventDefault(); }} onDrop={e => { e.preventDefault(); onEventDrop?.(day); }}>
        <button type="button" onClick={() => onDateSelect(day)} aria-label={'View calendar on ' + day} className="min-h-11 w-full text-left px-2 rounded-lg hover:bg-blue-50 text-sm">{Number(day.slice(-2))}</button>
        <div className="space-y-1">{events.filter(event => event.date === day).slice(0, 3).map(event => <button key={event.id} type="button" draggable={event.draggable} onDragStart={e => { e.dataTransfer.setData('text/plain', event.id); e.dataTransfer.effectAllowed = 'move'; event.onDragStart?.(e); }} onDragEnd={event.onDragEnd} onClick={() => onEventSelect ? onEventSelect(event) : onDateSelect(day)} title={event.title} className={'block w-full truncate rounded border-l-2 px-1 py-1 text-left text-[11px] ' + Object.values(CALENDAR_EVENT_STYLES[event.kind]).join(' ')}>{event.allDay ? '' : event.start + ' '}{event.title}</button>)}
        {events.filter(event => event.date === day).length > 3 && <button type="button" onClick={() => onDateSelect(day)} className="text-xs px-1 text-blue-700">+{events.filter(event => event.date === day).length - 3} more</button>}</div>
      </div>)}</div>
    </div>
    {(loading || error) && <div className="absolute inset-0 z-30 bg-white/90 flex justify-center pt-10"><div role={error ? 'alert' : 'status'} className="p-4 text-sm text-gray-700 text-center">{error || 'Loading availability…'}{error && onRetry && <button type="button" onClick={onRetry} className="block mx-auto mt-3 min-h-11 px-4 bg-blue-600 text-white rounded-lg">Retry</button>}</div></div>}
  </div>;
}
