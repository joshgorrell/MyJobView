import { CALENDAR_EVENT_STYLES } from './calendarStyles';
import { useEffect, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react';
import { minutes, timeKey, timeLabel } from '../../../lib/workOrderScheduling';

export interface CalendarColumn { key: string; date: string; label: string }
export interface CalendarGridEvent {
  id: string; columnKey: string; start: string; end: string; title: string;
  kind: 'work_order' | 'appointment' | 'time_off' | 'reminder'; allDay?: boolean; content?: ReactNode;
  draggable?: boolean; onDragStart?: (event: DragEvent) => void; onDragEnd?: () => void;
}
export const CALENDAR_ROW_HEIGHT = 30;
export const CALENDAR_FIRST_MINUTE = 0;
export const CALENDAR_LAST_MINUTE = 1440;
export const CALENDAR_SLOTS = Array.from({ length: (CALENDAR_LAST_MINUTE - CALENDAR_FIRST_MINUTE) / 30 }, (_, i) => timeKey(CALENDAR_FIRST_MINUTE + i * 30));


// Greedy lanes keep simultaneous bookings visible rather than covering one another.
function eventLanes(events: CalendarGridEvent[]) {
  const sorted = [...events].sort((a, b) => minutes(a.start) - minutes(b.start) || minutes(b.end) - minutes(a.end));
  const result: { event: CalendarGridEvent; lane: number; count: number }[] = [];
  let cluster: typeof result = [], ends: number[] = [], clusterEnd = -1;
  const flush = () => { for (const item of cluster) item.count = ends.length; result.push(...cluster); cluster = []; ends = []; };
  for (const event of sorted) {
    if (minutes(event.start) >= clusterEnd) flush();
    let lane = ends.findIndex(end => end <= minutes(event.start));
    if (lane < 0) lane = ends.length;
    ends[lane] = minutes(event.end);
    clusterEnd = Math.max(clusterEnd, minutes(event.end));
    cluster.push({ event, lane, count: 1 });
  }
  flush(); return result;
}

export function CalendarTimeGrid({ columns, events, onSlotSelect, onRangeSelect, slotState, onDropDate, onDropSlot, scrollRef, loading = false, error, onRetry, columnWidth = 110 }: {
  columns: CalendarColumn[]; events: CalendarGridEvent[];
  onSlotSelect: (column: CalendarColumn, start: string) => void;
  onRangeSelect?: (column: CalendarColumn, start: string, end: string) => void;
  slotState?: (column: CalendarColumn, start: string) => { disabled?: boolean; selected?: boolean };
  onDropDate?: (column: CalendarColumn) => void; onDropSlot?: (column: CalendarColumn, start: string) => void; scrollRef?: RefObject<HTMLDivElement>;
  loading?: boolean; error?: string | null; onRetry?: () => void; columnWidth?: number;
}) {
  const ownScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!scrollRef && ownScrollRef.current) ownScrollRef.current.scrollTop = 8 * 60; }, [scrollRef, columns[0]?.key]);
  const [range, setRange] = useState<{ column: CalendarColumn; start: string; end: string } | null>(null);
  const rangeRef = useRef(range);
  const suppressClick = useRef(false);
  const updateRange = (next: typeof range) => { rangeRef.current = next; setRange(next); };
  const finishRange = () => {
    const current = rangeRef.current;
    if (!current) return;
    updateRange(null); suppressClick.current = true;
    if (current.start === current.end) onSlotSelect(current.column, current.start);
    else onRangeSelect?.(current.column, timeKey(Math.min(minutes(current.start), minutes(current.end))), timeKey(Math.max(minutes(current.start), minutes(current.end)) + 30));
  };
  const allDay = events.filter(event => event.allDay);
  function renderEvent(event: CalendarGridEvent) {
    return <div key={event.id} draggable={event.draggable} onDragStart={e => { e.dataTransfer.setData('text/plain', event.id); e.dataTransfer.effectAllowed = 'move'; event.onDragStart?.(e); }} onDragEnd={event.onDragEnd} title={event.title + ' · ' + (event.allDay ? 'All day' : timeLabel(event.start) + ' – ' + timeLabel(event.end))} className={'h-full rounded-md border-l-2 px-1.5 py-0.5 text-[11px] overflow-hidden ' + Object.values(CALENDAR_EVENT_STYLES[event.kind]).join(' ')}>
      {event.content || <><span className="font-medium block truncate">{event.title}</span>{(event.allDay || minutes(event.end) - minutes(event.start) >= 60) && <span className="block truncate">{event.allDay ? 'All day' : timeLabel(event.start) + ' – ' + timeLabel(event.end)}</span>}</>}
    </div>;
  }
  return <div ref={scrollRef || ownScrollRef} className="relative max-h-[min(600px,65dvh)] overflow-auto overscroll-contain border border-gray-200 rounded-lg bg-white text-gray-900" aria-busy={loading} data-calendar-time-grid onMouseUp={finishRange} onMouseLeave={finishRange}>
    <div style={{ minWidth: Math.max(290, 56 + columns.length * columnWidth) }}>
      <div className="flex sticky top-0 min-h-11 z-20 bg-white border-b border-gray-200">
        <div className="w-14 shrink-0 sticky left-0 bg-white" />
        {columns.map(column => <div key={column.key} className="flex-1 min-w-0 py-3 px-1 text-center text-xs font-semibold border-l border-gray-200">{column.label}</div>)}
      </div>
      {allDay.length > 0 && <div className="flex sticky top-11 z-20 border-b border-gray-200 bg-gray-50"><div className="w-14 shrink-0 text-[10px] text-gray-500 text-right p-1">All day</div>{columns.map(column => <div key={column.key} className="flex-1 min-w-0 border-l border-gray-200 p-1 space-y-1" onDragOver={e => { if (onDropDate) e.preventDefault(); }} onDrop={e => { e.preventDefault(); onDropDate?.(column); }}>{allDay.filter(event => event.columnKey === column.key).map(renderEvent)}</div>)}</div>}
      <div className="flex">
        <div className="w-14 shrink-0 sticky left-0 z-10 bg-white">{CALENDAR_SLOTS.map(time => <div key={time} style={{ height: CALENDAR_ROW_HEIGHT }} className="text-[10px] text-gray-500 text-right pr-2 border-b border-gray-100">{time.endsWith(':00') ? timeLabel(time).replace(':00', '') : ''}</div>)}</div>
        {columns.map(column => <div key={column.key} className="relative flex-1 min-w-0 border-l border-gray-200" onDragOver={e => { if (onDropDate || onDropSlot) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (onDropSlot) { const y = e.clientY - e.currentTarget.getBoundingClientRect().top; const start = timeKey(Math.max(CALENDAR_FIRST_MINUTE, Math.min(CALENDAR_LAST_MINUTE - 30, CALENDAR_FIRST_MINUTE + Math.floor(y / CALENDAR_ROW_HEIGHT) * 30))); onDropSlot(column, start); } else onDropDate?.(column); }}>
          {CALENDAR_SLOTS.map(start => {
            const state = slotState?.(column, start) || {};
            const selected = state.selected || range?.column.key === column.key && minutes(start) >= Math.min(minutes(range.start), minutes(range.end)) && minutes(start) <= Math.max(minutes(range.start), minutes(range.end));
            return <button key={start} type="button" aria-label={'Schedule ' + column.label + ' on ' + column.date + ' at ' + timeLabel(start)} disabled={loading || Boolean(error) || state.disabled} onMouseDown={e => { if (onRangeSelect && e.button === 0) { suppressClick.current = false; updateRange({ column, start, end: start }); } }} onMouseEnter={() => { if (rangeRef.current?.column.key === column.key) updateRange({ ...rangeRef.current, end: start }); }} onKeyDown={() => { suppressClick.current = false; }} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onSlotSelect(column, start); }} style={{ height: CALENDAR_ROW_HEIGHT }} className={'block w-full border-b border-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ' + (selected ? 'bg-blue-100' : state.disabled ? 'bg-gray-50 cursor-default' : 'bg-white hover:bg-blue-50')} />;
          })}
          {eventLanes(events.filter(event => event.columnKey === column.key && !event.allDay)).map(({ event, lane, count }) => {
            const start = Math.max(CALENDAR_FIRST_MINUTE, minutes(event.start)), end = Math.min(CALENDAR_LAST_MINUTE, minutes(event.end));
            if (end <= start) return null;
            return <div key={event.id} className="absolute" style={{ top: (start - CALENDAR_FIRST_MINUTE) / 30 * CALENDAR_ROW_HEIGHT, height: Math.max(18, (end - start) / 30 * CALENDAR_ROW_HEIGHT), left: `calc(${lane / count * 100}% + 3px)`, width: `calc(${100 / count}% - 6px)` }}>{renderEvent(event)}</div>;
          })}
        </div>)}
      </div>
    </div>
    {(loading || error) && <div className="absolute inset-0 z-30 bg-white/90 flex items-start justify-center pt-10"><div role={error ? 'alert' : 'status'} className="p-4 text-sm text-gray-700 text-center max-w-sm">{error || 'Loading availability…'}{error && onRetry && <button type="button" onClick={onRetry} className="block mx-auto mt-3 min-h-11 px-4 bg-blue-600 text-white rounded-lg">Retry</button>}</div></div>}
  </div>;
}
