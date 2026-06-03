import { useState, useEffect } from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  presets?: { label: string; value: string }[];
  disabled?: boolean;
  id?: string;
}

const VALID_MINUTES = [0, 30];

function to24Hour(hours: number, minutes: number, period: 'AM' | 'PM'): string {
  let h = hours;
  if (period === 'AM' && h === 12) h = 0;
  if (period === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function from24Hour(value: string): { hours: number; minutes: number; period: 'AM' | 'PM' } {
  if (!value) return { hours: 12, minutes: 0, period: 'AM' };
  const [hStr, mStr] = value.split(':');
  let h = parseInt(hStr, 10);
  const rawMin = parseInt(mStr, 10);
  const m = rawMin < 30 ? 0 : 30;
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return { hours: h, minutes: m, period };
}

export function TimePicker({
  value,
  onChange,
  label,
  required,
  placeholder,
  presets,
  disabled,
  id
}: TimePickerProps) {
  const parsed = from24Hour(value);
  const [hours, setHours] = useState(parsed.hours);
  const [minutes, setMinutes] = useState(parsed.minutes);
  const [period, setPeriod] = useState<'AM' | 'PM'>(parsed.period);

  useEffect(() => {
    const p = from24Hour(value);
    setHours(p.hours);
    setMinutes(p.minutes);
    setPeriod(p.period);
  }, [value]);

  function emit(h: number, m: number, p: 'AM' | 'PM') {
    onChange(to24Hour(h, m, p));
  }

  function adjustHour(delta: number) {
    let h = hours + delta;
    if (h > 12) h = 1;
    if (h < 1) h = 12;
    setHours(h);
    emit(h, minutes, period);
  }

  function toggleMinutes() {
    const idx = VALID_MINUTES.indexOf(minutes);
    const next = VALID_MINUTES[(idx + 1) % VALID_MINUTES.length];
    setMinutes(next);
    emit(hours, next, period);
  }

  function togglePeriod() {
    const p: 'AM' | 'PM' = period === 'AM' ? 'PM' : 'AM';
    setPeriod(p);
    emit(hours, minutes, p);
  }

  return (
    <div className={`${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          <Clock className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <div
        id={id}
        className="border border-gray-300 rounded-lg bg-white shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent"
      >
        <div className="flex items-center">
          <div className="flex items-center flex-1 px-3 py-2 gap-1">
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => adjustHour(1)}
                className="text-gray-400 hover:text-blue-600 transition-colors p-0.5"
                tabIndex={-1}
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <span className="w-8 text-center text-lg font-semibold text-gray-900 py-0.5 select-none">
                {hours}
              </span>
              <button
                type="button"
                onClick={() => adjustHour(-1)}
                className="text-gray-400 hover:text-blue-600 transition-colors p-0.5"
                tabIndex={-1}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <span className="text-xl font-bold text-gray-400 pb-0.5">:</span>

            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={toggleMinutes}
                className="text-gray-400 hover:text-blue-600 transition-colors p-0.5"
                tabIndex={-1}
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={toggleMinutes}
                className="w-8 text-center text-lg font-semibold text-gray-900 bg-transparent py-0.5 hover:bg-blue-50 rounded transition-colors"
                tabIndex={-1}
                title="Toggle :00 / :30"
              >
                {String(minutes).padStart(2, '0')}
              </button>
              <button
                type="button"
                onClick={toggleMinutes}
                className="text-gray-400 hover:text-blue-600 transition-colors p-0.5"
                tabIndex={-1}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={togglePeriod}
            className="self-stretch px-4 bg-gray-50 border-l border-gray-200 text-sm font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors min-w-[52px]"
          >
            {period}
          </button>
        </div>

        {!value && placeholder && (
          <div className="px-3 pb-2 text-xs text-gray-400">{placeholder}</div>
        )}
      </div>

      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {presets.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                value === p.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
              }`}
              tabIndex={-1}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
