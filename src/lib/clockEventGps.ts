import { supabase } from './supabase';
import { gpsTrackingService } from './gpsTracking';
import { offlineStorage } from './offlineStorage';
import { offlineSupabaseUpdate } from './offlineSupport';
import { updateClockEntryAddress } from './reverseGeocode';

/** Preserve the event reading, including failed attempts, through the durable offline queue. */
export async function saveClockEventGps(entryId: string, table: 'daily_clock_entries' | 'time_entries', clockOut = false, capture = gpsTrackingService.captureLocationForClockEvent(clockOut)) {
  const gps = await capture;
  const prefix = clockOut ? 'clock_out' : 'clock_in';
  const values: Record<string, unknown> = {
    [`${prefix}_latitude`]: gps.latitude,
    [`${prefix}_longitude`]: gps.longitude,
    [`${prefix}_gps_accuracy`]: gps.accuracy,
    [`${prefix}_gps_capture_method`]: gps.method,
    [`${prefix}_gps_duration_ms`]: gps.duration_ms,
    [`${prefix}_gps_attempted_at`]: gps.attempted_at,
    [`${prefix}_gps_captured_at`]: gps.captured_at,
  };
  if (navigator.onLine) {
    try {
      const {data,error} = await supabase.rpc('calculate_gps_quality_score', {
        p_accuracy:gps.accuracy,p_method:gps.method,p_duration_ms:gps.duration_ms,p_refined:false,p_original_accuracy:null,
      });
      if (!error) values[`${prefix}_gps_quality_score`] = data || 0;
    } catch { /* Coordinates remain useful without a quality score. */ }
  }
  const { error } = await offlineSupabaseUpdate(table, values, entryId);
  if (error) {
    // Connectivity can disappear before navigator.onLine reflects it.
    if (/failed to fetch|fetch failed|network|load failed/i.test(error.message || '')) {
      await offlineStorage.addToSyncQueue({type:'update',table,data:{...values,id:entryId}});
    } else throw error;
  }
  if (navigator.onLine && gps.latitude !== null && gps.longitude !== null) {
    await updateClockEntryAddress(entryId, gps.latitude, gps.longitude, clockOut, table);
  }
  return gps;
}
