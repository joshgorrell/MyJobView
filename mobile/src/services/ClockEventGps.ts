import { locationTrackingService } from './LocationTrackingService';
import { offlineStorage } from './OfflineStorage';
import { supabase } from './supabase';
import type * as Location from 'expo-location';
/** Explicit punch evidence only. Never starts a watcher or background location task. */
export async function saveNativeClockGps(entryId: string, technicianId: string, clockOut: boolean, capture: Promise<Location.LocationObject | null>, attemptedAt: string) {
  const location = await capture.catch(() => null);
  const prefix = clockOut ? 'clock_out' : 'clock_in';
  const values = {
    [`${prefix}_gps_attempted_at`]: attemptedAt,
    [`${prefix}_gps_capture_method`]: location ? ((location.coords as any).method === 'cached' ? 'cached' : 'high_accuracy') : 'failed',
    [`${prefix}_latitude`]: location?.coords.latitude ?? null,
    [`${prefix}_longitude`]: location?.coords.longitude ?? null,
    [`${prefix}_gps_accuracy`]: location?.coords.accuracy ?? null,
    [`${prefix}_gps_captured_at`]: location ? new Date(location.timestamp).toISOString() : null,
    [`${prefix}_gps_duration_ms`]: location ? (location.coords as any).duration_ms || 0 : Date.now() - Date.parse(attemptedAt),
  };
  // Durable before network work; sync remains tied to the account that recorded the punch.
  await offlineStorage.saveClockGps(`${entryId}:${prefix}`, entryId, technicianId, values);
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.id !== technicianId) return;
  const { data, error } = await supabase.from('daily_clock_entries').update(values).eq('id', entryId).eq('technician_id', technicianId).select('id');
  if (!error && data?.length) await offlineStorage.removeClockGps(`${entryId}:${prefix}`);
}
