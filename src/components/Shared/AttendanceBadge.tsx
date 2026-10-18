import { useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
export interface AttendanceResult { daily_clock_entry_id: string; event_type: string; points_awarded: number; minutes_delta: number; scheduled_time: string; actual_time: string }
/** Read the scored snapshot, never recalculate history from today's profile schedule. */
export function useAttendanceResults(entryIds: string[]) {
  const key = entryIds.join(',');
  const [results, setResults] = useState<Record<string, AttendanceResult>>({});
  useEffect(() => {
    let active = true;
    async function load() {
      if (!key) { setResults({}); return; }
      const { data, error } = await supabase.from('clock_in_rewards_log').select('daily_clock_entry_id,event_type,points_awarded,minutes_delta,scheduled_time,actual_time').in('daily_clock_entry_id', key.split(',')).in('event_type', ['early', 'on_time', 'late', 'very_late']);
      if (!error && active) setResults(Object.fromEntries((data || []).map(r => [r.daily_clock_entry_id, r])));
    }
    void load();
    const channel = supabase.channel(`attendance-${key.slice(0, 36)}`).on('postgres_changes', { event: '*', schema: 'public', table: 'clock_in_rewards_log' }, load).subscribe();
    return () => { active = false; void channel.unsubscribe(); };
  }, [key]);
  return results;
}
export function AttendanceBadge({ result }: { result?: AttendanceResult }) {
  if (!result) return null;
  const positive = ['early', 'on_time'].includes(result.event_type);
  const label = positive ? (result.event_type === 'early' ? 'Early' : 'On time') : result.event_type === 'late' ? 'Late' : 'Really late';
  const color = positive ? 'bg-green-100 text-green-800' : result.event_type === 'late' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
  const Icon = positive ? ThumbsUp : ThumbsDown;
  const details = `${label}${result.minutes_delta > 0 ? ` · ${result.minutes_delta} minutes late` : ''} · ${result.points_awarded > 0 ? '+' : ''}${result.points_awarded} points`;
  return <details className="inline-block text-xs"><summary aria-label={details} title={details} className={`list-none cursor-pointer inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg ${color}`}><Icon aria-hidden="true" className="h-4 w-4" /><span className="sr-only">{details}</span></summary><span className="block mt-1 text-xs text-secondary">{details}</span></details>;
}
