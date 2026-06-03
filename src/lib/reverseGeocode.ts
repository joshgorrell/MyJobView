import { supabase } from './supabase';

interface ReverseGeocodeResult {
  address: string | null;
  error?: string;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
  try {
    const { data: settings, error: settingsError } = await supabase
      .from('company_settings')
      .select('google_maps_api_key')
      .maybeSingle();

    if (settingsError || !settings?.google_maps_api_key) {
      return { address: null, error: 'API key not configured' };
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${settings.google_maps_api_key}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return { address: null, error: data.status };
    }

    return { address: data.results[0].formatted_address };
  } catch (error) {
    console.error('Error during reverse geocoding:', error);
    return { address: null, error: String(error) };
  }
}

export async function updateClockEntryAddress(
  entryId: string,
  latitude: number,
  longitude: number,
  isClockOut: boolean = false,
  tableName: 'daily_clock_entries' | 'time_entries' = 'daily_clock_entries'
): Promise<void> {
  try {
    const result = await reverseGeocode(latitude, longitude);
    if (!result.address) return;

    const updateData: Record<string, string> = {};
    if (isClockOut) {
      updateData.clock_out_address = result.address;
    } else {
      updateData.clock_in_address = result.address;
    }

    await supabase
      .from(tableName)
      .update(updateData)
      .eq('id', entryId);
  } catch (error) {
    console.error('Error updating clock entry address:', error);
  }
}
