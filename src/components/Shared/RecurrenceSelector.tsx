import { useState, useEffect } from 'react';
import { Repeat, X } from 'lucide-react';

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  days_of_week?: number[]; // 0=Sun, 1=Mon … 6=Sat
  day_of_month?: number;
  end_date?: string;
  occurrences?: number;
}

interface RecurrenceSelectorProps {
  value: RecurrenceRule | null;
  onChange: (rule: RecurrenceRule | null) => void;
  startDate?: string; // ISO date string used to pre-populate day_of_month / days_of_week
}

const FREQ_LABELS: Record<RecurrenceRule['frequency'], string> = {
  daily: 'Day(s)',
  weekly: 'Week(s)',
  monthly: 'Month(s)',
  yearly: 'Year(s)',
};

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildSummary(rule: RecurrenceRule | null): string {
  if (!rule) return '';

  const intervalStr = rule.interval === 1 ? '' : `every ${rule.interval} `;
  let base = '';

  switch (rule.frequency) {
    case 'daily':
      base = rule.interval === 1 ? 'Repeats daily' : `Repeats every ${rule.interval} days`;
      break;
    case 'weekly': {
      const days =
        rule.days_of_week && rule.days_of_week.length > 0
          ? rule.days_of_week
              .slice()
              .sort((a, b) => a - b)
              .map(d => DAY_FULL[d])
              .join(', ')
          : 'the same day';
      base =
        rule.interval === 1
          ? `Repeats weekly on ${days}`
          : `Repeats every ${rule.interval} weeks on ${days}`;
      break;
    }
    case 'monthly':
      base =
        rule.interval === 1
          ? `Repeats monthly on day ${rule.day_of_month ?? '—'}`
          : `Repeats every ${rule.interval} months on day ${rule.day_of_month ?? '—'}`;
      break;
    case 'yearly':
      base =
        rule.interval === 1 ? 'Repeats yearly' : `Repeats every ${rule.interval} years`;
      break;
  }

  if (rule.end_date) {
    const d = new Date(rule.end_date + 'T00:00:00');
    base += `, ending ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } else if (rule.occurrences) {
    base += `, ${rule.occurrences} occurrence${rule.occurrences !== 1 ? 's' : ''}`;
  } else {
    base += ', no end date';
  }

  return base;
}

export function RecurrenceSelector({ value, onChange, startDate }: RecurrenceSelectorProps) {
  const [enabled, setEnabled] = useState(value !== null);
  const [frequency, setFrequency] = useState<RecurrenceRule['frequency']>(value?.frequency ?? 'weekly');
  const [interval, setIntervalVal] = useState(value?.interval ?? 1);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(() => {
    if (value?.days_of_week) return value.days_of_week;
    if (startDate) {
      const d = new Date(startDate + 'T00:00:00');
      return [d.getDay()];
    }
    return [1]; // Monday default
  });
  const [dayOfMonth, setDayOfMonth] = useState<number>(() => {
    if (value?.day_of_month) return value.day_of_month;
    if (startDate) {
      const d = new Date(startDate + 'T00:00:00');
      return d.getDate();
    }
    return 1;
  });
  const [endsType, setEndsType] = useState<'never' | 'date' | 'count'>(
    value?.end_date ? 'date' : value?.occurrences ? 'count' : 'never'
  );
  const [endDate, setEndDate] = useState(value?.end_date ?? '');
  const [occurrences, setOccurrences] = useState(value?.occurrences ?? 10);

  // Sync day_of_month / daysOfWeek when startDate changes
  useEffect(() => {
    if (!startDate) return;
    const d = new Date(startDate + 'T00:00:00');
    if (!value?.days_of_week) setDaysOfWeek([d.getDay()]);
    if (!value?.day_of_month) setDayOfMonth(d.getDate());
  }, [startDate]);

  // Build and emit rule whenever state changes
  useEffect(() => {
    if (!enabled) {
      onChange(null);
      return;
    }
    const rule: RecurrenceRule = {
      frequency,
      interval,
    };
    if (frequency === 'weekly' && daysOfWeek.length > 0) {
      rule.days_of_week = daysOfWeek;
    }
    if (frequency === 'monthly') {
      rule.day_of_month = dayOfMonth;
    }
    if (endsType === 'date' && endDate) {
      rule.end_date = endDate;
    } else if (endsType === 'count' && occurrences > 0) {
      rule.occurrences = occurrences;
    }
    onChange(rule);
  }, [enabled, frequency, interval, daysOfWeek, dayOfMonth, endsType, endDate, occurrences]);

  function toggleDay(day: number) {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  const currentRule: RecurrenceRule | null = enabled
    ? {
        frequency,
        interval,
        days_of_week: frequency === 'weekly' ? daysOfWeek : undefined,
        day_of_month: frequency === 'monthly' ? dayOfMonth : undefined,
        end_date: endsType === 'date' && endDate ? endDate : undefined,
        occurrences: endsType === 'count' ? occurrences : undefined,
      }
    : null;

  const summary = buildSummary(currentRule);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setEnabled(prev => !prev)}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
          enabled ? 'bg-blue-50 border-b border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <div className="flex items-center gap-2">
          <Repeat className={`w-4 h-4 ${enabled ? 'text-blue-600' : 'text-gray-400'}`} />
          <span className={`text-sm font-medium ${enabled ? 'text-blue-800' : 'text-gray-600'}`}>
            {enabled ? 'Recurring' : 'Does not repeat'}
          </span>
        </div>
        <div
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            enabled ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </div>
      </button>

      {/* Expanded panel */}
      {enabled && (
        <div className="px-4 py-4 space-y-4 bg-white">
          {/* Frequency + Interval */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600 whitespace-nowrap">Repeat every</span>
            <input
              type="number"
              min={1}
              max={99}
              value={interval}
              onChange={e => setIntervalVal(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={frequency}
              onChange={e => setFrequency(e.target.value as RecurrenceRule['frequency'])}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="daily">Day(s)</option>
              <option value="weekly">Week(s)</option>
              <option value="monthly">Month(s)</option>
              <option value="yearly">Year(s)</option>
            </select>
          </div>

          {/* Weekly: day-of-week picker */}
          {frequency === 'weekly' && (
            <div>
              <p className="text-xs text-gray-500 mb-2">On these days</p>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                      daysOfWeek.includes(idx)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Monthly: day of month */}
          {frequency === 'monthly' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">On day</span>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={e => setDayOfMonth(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-sm text-gray-500">of the month</span>
            </div>
          )}

          {/* Ends section */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Ends</p>
            <div className="space-y-2">
              {/* Never */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="endsType"
                  value="never"
                  checked={endsType === 'never'}
                  onChange={() => setEndsType('never')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Never</span>
              </label>

              {/* On date */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="endsType"
                  value="date"
                  checked={endsType === 'date'}
                  onChange={() => setEndsType('date')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 whitespace-nowrap">On date</span>
                {endsType === 'date' && (
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    min={startDate}
                    className="ml-1 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </label>

              {/* After N occurrences */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="endsType"
                  value="count"
                  checked={endsType === 'count'}
                  onChange={() => setEndsType('count')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 whitespace-nowrap">After</span>
                {endsType === 'count' && (
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={occurrences}
                    onChange={e => setOccurrences(Math.max(1, parseInt(e.target.value) || 1))}
                    className="ml-1 w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
                {endsType === 'count' && (
                  <span className="text-sm text-gray-500">occurrence{occurrences !== 1 ? 's' : ''}</span>
                )}
              </label>
            </div>
          </div>

          {/* Plain-English summary */}
          {summary && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-700 font-medium">{summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
