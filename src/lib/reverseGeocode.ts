import { supabase } from './supabase';

interface AddressComponents {
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

interface ReverseGeocodeResult {
  address: string | null;
  components: AddressComponents | null;
  error?: string;
}

function parseAddressComponents(
  addressComponents: any[]
): AddressComponents {
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;
  let country: string | null = null;

  for (const comp of addressComponents) {
    const types: string[] = comp.types || [];
    if (types.includes('locality') || types.includes('administrative_area_level_3')) {
      city = comp.long_name || city;
    }
    if (types.includes('administrative_area_level_1')) {
      state = comp.short_name || null;
    }
    if (types.includes('postal_code')) {
      zip = comp.long_name || zip;
    }
    if (types.includes('country')) {
      country = comp.short_name || country;
    }
  }

  return { city, state, zip, country };
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> {
  try {
    const { data: settings, error: settingsError } = await supabase
      .from('company_settings')
      .select('google_maps_api_key')
      .maybeSingle();

    if (settingsError || !settings?.google_maps_api_key) {
      return { address: null, components: null, error: 'API key not configured' };
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${settings.google_maps_api_key}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return { address: null, components: null, error: data.status };
    }

    const formattedAddress = data.results[0].formatted_address as string;
    const components = parseAddressComponents(
      data.results[0].address_components || []
    );

    return { address: formattedAddress, components };
  } catch (error) {
    console.error('Error during reverse geocoding:', error);
    return { address: null, components: null, error: String(error) };
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

    const updateData: Record<string, string | null> = {};
    if (isClockOut) {
      updateData.clock_out_address = result.address;
    } else {
      updateData.clock_in_address = result.address;
    }

    if (result.components?.state) {
      updateData.physical_work_location_state = result.components.state;
    }

    await supabase
      .from(tableName)
      .update(updateData)
      .eq('id', entryId);
  } catch (error) {
    console.error('Error updating clock entry address:', error);
  }
}
