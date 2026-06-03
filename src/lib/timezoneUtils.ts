import { format, parse, parseISO } from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { supabase } from './supabase';

let cachedTimezone: string | null = null;

export async function getOrganizationTimezone(): Promise<string> {
  if (cachedTimezone) {
    return cachedTimezone;
  }

  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('timezone')
      .limit(1)
      .single();

    if (error) throw error;

    cachedTimezone = data?.timezone || 'America/Chicago';
    return cachedTimezone;
  } catch (error) {
    console.error('Error fetching organization timezone:', error);
    return 'America/Chicago';
  }
}

export function clearTimezoneCache() {
  cachedTimezone = null;
}

export function normalizeDateString(date: string): string {
  if (!date) return '';

  const trimmed = date.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // M/D/YYYY or MM/DD/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // M-D-YYYY or MM-DD-YYYY
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, m, d, y] = dashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // If it contains a T or space (datetime string), extract the date portion
  const datePortionMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  if (datePortionMatch) return datePortionMatch[1];

  // Fallback: try native Date parse and reformat
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return trimmed;
}

export function normalizeTimeString(time: string): string {
  if (!time) return '00:00';

  const trimmed = time.trim();

  // Already HH:MM or HH:MM:SS
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) return trimmed.slice(0, 5);

  // H:MM (single digit hour)
  if (/^\d{1}:\d{2}$/.test(trimmed)) return trimmed.padStart(5, '0');

  // 12-hour format: 8:00 AM, 08:00 AM
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const mins = ampmMatch[2];
    const period = ampmMatch[3].toUpperCase();
    if (period === 'AM' && h === 12) h = 0;
    if (period === 'PM' && h !== 12) h += 12;
    return `${String(h).padStart(2, '0')}:${mins}`;
  }

  // If it contains a T or space (datetime string), extract the time portion
  const timePortionMatch = trimmed.match(/[T ](\d{2}:\d{2})/);
  if (timePortionMatch) return timePortionMatch[1];

  return trimmed.slice(0, 5);
}

export function createTimestampInTimezone(
  date: string,
  time: string,
  timezone: string
): string {
  const normalizedDate = normalizeDateString(date);
  const normalizedTime = normalizeTimeString(time);
  const dateTimeString = `${normalizedDate}T${normalizedTime}`;
  const zonedDate = fromZonedTime(dateTimeString, timezone);
  return zonedDate.toISOString();
}

export function formatTimeInTimezone(
  timestamp: string,
  timezone: string,
  formatString: string = 'HH:mm'
): string {
  try {
    const date = parseISO(timestamp);
    return formatInTimeZone(date, timezone, formatString);
  } catch (error) {
    console.error('Error formatting time in timezone:', error);
    return '';
  }
}

export function formatDateInTimezone(
  timestamp: string,
  timezone: string,
  formatString: string = 'yyyy-MM-dd'
): string {
  try {
    const date = parseISO(timestamp);
    return formatInTimeZone(date, timezone, formatString);
  } catch (error) {
    console.error('Error formatting date in timezone:', error);
    return '';
  }
}

export function getLocalTimeFromUTC(
  timestamp: string,
  timezone: string
): Date {
  try {
    const date = parseISO(timestamp);
    return toZonedTime(date, timezone);
  } catch (error) {
    console.error('Error converting UTC to local time:', error);
    return new Date();
  }
}

export function calculateDuration(
  startTimestamp: string,
  endTimestamp: string,
  breakMinutes: number = 0
): number {
  try {
    const start = parseISO(startTimestamp);
    const end = parseISO(endTimestamp);
    const diffMs = end.getTime() - start.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const breakHours = breakMinutes / 60;
    return Math.max(0, diffHours - breakHours);
  } catch (error) {
    console.error('Error calculating duration:', error);
    return 0;
  }
}

export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AK)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
];

export function getTimezoneLabel(timezone: string): string {
  const option = TIMEZONE_OPTIONS.find(opt => opt.value === timezone);
  return option?.label || timezone;
}
