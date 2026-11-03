import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { getOrganizationTimezone } from '../../../lib/timezoneUtils';

// All calendar surfaces use the same accessible, touch-sized controls.
export function CalendarNavigation({ date, onDateChange, onPrevious, onNext, onToday, children }: {
  date: string; onDateChange: (date: string) => void; onPrevious: () => void; onNext: () => void;
  onToday?: () => void; children?: ReactNode;
}) {
  const [timezone, setTimezone] = useState('America/Chicago');
  useEffect(() => { let active = true; void getOrganizationTimezone().then(tz => { if (active) setTimezone(tz); }); return () => { active = false; }; }, []);
  return <div className="flex flex-wrap items-center gap-2 min-w-0 text-gray-900" data-calendar-controls>
    <div className="flex items-center gap-1 shrink-0">
      <button type="button" aria-label="Previous calendar period" onClick={onPrevious} className="min-h-11 min-w-11 rounded-lg bg-white border border-gray-200 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500"><ChevronLeft className="h-4 w-4 mx-auto" /></button>
      <button type="button" onClick={() => onToday ? onToday() : onDateChange(formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd'))} className="min-h-11 px-3 border border-gray-200 bg-white rounded-lg text-sm font-medium hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500">Today</button>
      <button type="button" aria-label="Next calendar period" onClick={onNext} className="min-h-11 min-w-11 rounded-lg bg-white border border-gray-200 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500"><ChevronRight className="h-4 w-4 mx-auto" /></button>
    </div>
    <input type="date" aria-label="Calendar date" value={date} onChange={e => { if (e.target.value) onDateChange(e.target.value); }} className="min-h-11 min-w-0 max-w-full rounded-lg bg-white border border-gray-200 p-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500" />
    {children}
  </div>;
}
export function CalendarViewSwitcher<T extends string>({ value, onChange, options }: {
  value: T; onChange: (value: T) => void; options: readonly { value: T; label: string }[];
}) {
  return <div className="flex flex-wrap rounded-lg bg-white border border-gray-200 p-0.5 text-gray-900" role="group" aria-label="Calendar view">
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={'min-h-11 px-3 text-sm rounded-md focus-visible:ring-2 focus-visible:ring-blue-500 ' + (value === option.value ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50')}>{option.label}</button>)}
  </div>;
}
