import { supabase } from './supabase';

export interface ETAResult {
  distance_meters: number;
  travel_time_seconds: number;
  estimated_arrival: string;
  tech_lat: number;
  tech_lng: number;
  location_age_seconds: number;
}

export interface TechLocation {
  latitude: number;
  longitude: number;
  recorded_at: string;
  accuracy: number | null;
}

export async function calculateJobETA(
  techId: string,
  destLat: number,
  destLng: number
): Promise<ETAResult | null> {
  try {
    const { data, error } = await supabase.rpc('calculate_eta', {
      tech_id: techId,
      dest_lat: destLat,
      dest_lng: destLng
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      return null;
    }

    return data[0];
  } catch (error) {
    console.error('Error calculating ETA:', error);
    return null;
  }
}

export async function getTechCurrentLocation(techId: string): Promise<TechLocation | null> {
  try {
    const { data, error } = await supabase.rpc('get_tech_current_location', {
      tech_id: techId
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      return null;
    }

    return data[0];
  } catch (error) {
    console.error('Error getting tech location:', error);
    return null;
  }
}

export async function updateTechLocation(
  techId: string,
  latitude: number,
  longitude: number,
  accuracy?: number,
  heading?: number,
  speed?: number,
  batteryLevel?: number
): Promise<boolean> {
  try {
    const { error } = await supabase.from('tech_locations').insert({
      technician_id: techId,
      latitude,
      longitude,
      accuracy,
      heading,
      speed,
      battery_level: batteryLevel
    });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating tech location:', error);
    return false;
  }
}

export async function updateWorkOrderETA(
  workOrderId: string,
  techId: string,
  destLat: number,
  destLng: number
): Promise<void> {
  const eta = await calculateJobETA(techId, destLat, destLng);

  if (eta) {
    await supabase
      .from('work_orders')
      .update({
        estimated_arrival: eta.estimated_arrival
      })
      .eq('id', workOrderId);
  }
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }

  const km = meters / 1000;
  if (km < 10) {
    return `${km.toFixed(1)}km`;
  }

  return `${Math.round(km)}km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

export function formatETA(isoString: string): string {
  const eta = new Date(isoString);
  const now = new Date();
  const diffMs = eta.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return 'Arriving now';
  }

  if (diffMins < 60) {
    return `${diffMins} min`;
  }

  return eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
