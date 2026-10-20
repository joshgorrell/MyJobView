import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { offlineStorage } from './OfflineStorage';

const LOCATION_TASK_NAME = 'field-ops-background-location';
const TRACKING_SESSION_KEY = 'mjv-active-location-session';

interface TrackingSession {
  technicianId: string;
  clockEntryId: string;
}

// Must be registered at module evaluation so headless background launches can execute it.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (locations?.length) await locationTrackingService.handleLocationUpdate(locations);
});

interface TrackingConfig {
  accuracy: Location.Accuracy;
  timeInterval: number;
  distanceInterval: number;
}

class LocationTrackingService {
  private isTracking = false;
  private currentClockEntryId: string | null = null;
  private currentTechnicianId: string | null = null;
  private batteryLevel: number = 1.0;
  private lastKnownLocation: Location.LocationObject | null = null;

  async initialize() {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      throw new Error('Foreground location permission not granted');
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.warn('Background location permission not granted - limited functionality');
    }

    this.batteryLevel = await Battery.getBatteryLevelAsync();
    Battery.addBatteryLevelListener(({ batteryLevel }) => {
      this.batteryLevel = batteryLevel;
      this.adjustTrackingConfig();
    });

  }

  async startTracking(technicianId: string, clockEntryId: string) {
    const session: TrackingSession = { technicianId, clockEntryId };
    const existing = await SecureStore.getItemAsync(TRACKING_SESSION_KEY);
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (running && !existing) {
      throw new Error('Location tracking is active without a recoverable shift; restart tracking after resolving the previous session');
    }
    if (running && existing) {
      const previous = JSON.parse(existing) as TrackingSession;
      if (previous.technicianId !== technicianId || previous.clockEntryId !== clockEntryId) {
        throw new Error('A different GPS tracking session is already active');
      }
      this.isTracking = true;
      this.currentTechnicianId = technicianId;
      this.currentClockEntryId = clockEntryId;
      return;
    }

    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== 'granted') throw new Error('Location permission is required for workday GPS tracking');
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status !== 'granted') throw new Error('Background location permission is required for workday GPS tracking');

    // Persist before activating the OS task so early callbacks can identify the shift.
    await SecureStore.setItemAsync(TRACKING_SESSION_KEY, JSON.stringify(session));
    try {
      const config = this.getTrackingConfig();
      if (!running) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: config.accuracy,
          timeInterval: config.timeInterval,
          distanceInterval: config.distanceInterval,
          foregroundService: Platform.OS === 'android' ? {
            notificationTitle: 'MyJobView',
            notificationBody: 'Workday location tracking active',
            notificationColor: '#2563eb',
          } : undefined,
          showsBackgroundLocationIndicator: true,
        });
      }
      this.isTracking = true;
      this.currentTechnicianId = technicianId;
      this.currentClockEntryId = clockEntryId;
    } catch (error) {
      await SecureStore.deleteItemAsync(TRACKING_SESSION_KEY);
      throw error;
    }
  }

  async stopTracking() {
    // Disable new breadcrumb writes first, including callbacks from another JS runtime.
    const session = await this.getTrackingSession();
    await SecureStore.deleteItemAsync(TRACKING_SESSION_KEY);
    this.isTracking = false;
    this.currentClockEntryId = null;
    this.currentTechnicianId = null;
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (session) console.log('Workday GPS tracking stopped');
  }

  private async getTrackingSession(): Promise<TrackingSession | null> {
    const raw = await SecureStore.getItemAsync(TRACKING_SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as TrackingSession;
      return parsed.technicianId && parsed.clockEntryId ? parsed : null;
    } catch {
      return null;
    }
  }

  async captureHighAccuracyLocation(): Promise<Location.LocationObject | null> {
    const startTime = Date.now();
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted' && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== 'granted') return null;
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      const duration = Date.now() - startTime;
      this.lastKnownLocation = location;

      return {
        ...location,
        coords: {
          ...location.coords,
          duration_ms: duration,
          method: 'high_accuracy_request',
        } as any,
      };
    } catch (error) {
      console.error('Failed to get high accuracy location:', error);

      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') return null;

      if (this.lastKnownLocation && Date.now() - this.lastKnownLocation.timestamp <= 30000) {
        return { ...this.lastKnownLocation, coords: { ...this.lastKnownLocation.coords, method: 'cached', duration_ms: Date.now() - startTime } as any };
      }

      try {
        const location = await Location.getLastKnownPositionAsync({
          maxAge: 30000,
          requiredAccuracy: 100,
        });
        return location ? { ...location, coords: { ...location.coords, method: 'cached', duration_ms: Date.now() - startTime } as any } : null;
      } catch (fallbackError) {
        console.error('All location capture methods failed:', fallbackError);
        return null;
      }
    }
  }

  async handleLocationUpdate(locations: Location.LocationObject[]) {
    const session = await this.getTrackingSession();
    if (!session) return;
    // Verify that the persisted shift still belongs to the signed-in account.
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession || authSession.user.id !== session.technicianId) return;
    for (const location of locations) {
      // Re-check for clock-out between queued points.
      const active = await this.getTrackingSession();
      if (!active || active.clockEntryId !== session.clockEntryId ||
          active.technicianId !== session.technicianId) return;
      try {
        await this.saveLocationBreadcrumb(location, 'background_update', session);
        this.lastKnownLocation = location;
      } catch (error) {
        console.error('Failed to handle location update:', error);
      }
    }
  }

  private async saveLocationBreadcrumb(
    location: Location.LocationObject,
    captureMethod: string,
    session: TrackingSession
  ) {
    const breadcrumb = {
      id: Crypto.randomUUID(),
      technician_id: session.technicianId,
      daily_clock_entry_id: session.clockEntryId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude,
      accuracy: location.coords.accuracy,
      altitude_accuracy: location.coords.altitudeAccuracy,
      heading: location.coords.heading,
      speed: location.coords.speed,
      captured_at: new Date(location.timestamp).toISOString(),
      capture_method: captureMethod,
      battery_level: this.batteryLevel,
      device_model: Device.modelName,
      os_version: `${Platform.OS} ${Device.osVersion}`,
    };
    try {
      const { error } = await supabase.from('enhanced_gps_breadcrumbs').insert(breadcrumb);
      if (error) throw error;
    } catch (error) {
      await offlineStorage.saveBreadcrumb(breadcrumb);
    }
  }

  private getTrackingConfig(): TrackingConfig {
    if (this.batteryLevel < 0.15) {
      return {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 120000,
        distanceInterval: 100,
      };
    } else if (this.batteryLevel < 0.30) {
      return {
        accuracy: Location.Accuracy.High,
        timeInterval: 60000,
        distanceInterval: 50,
      };
    } else {
      return {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 30000,
        distanceInterval: 25,
      };
    }
  }

  private async adjustTrackingConfig() {
    if (!this.isTracking) return;

    const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);

      const config = this.getTrackingConfig();
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: config.accuracy,
        timeInterval: config.timeInterval,
        distanceInterval: config.distanceInterval,
        foregroundService: Platform.OS === 'android' ? {
          notificationTitle: 'MyJobView',
          notificationBody: 'Location services active',
          notificationColor: '#2563eb',
        } : undefined,
        showsBackgroundLocationIndicator: false,
      });
    }
  }

  getCurrentLocation(): Location.LocationObject | null {
    return this.lastKnownLocation;
  }

  isCurrentlyTracking(): boolean {
    return this.isTracking;
  }

  getCurrentClockEntryId(): string | null {
    return this.currentClockEntryId;
  }
}

export const locationTrackingService = new LocationTrackingService();

export async function initializeLocationTracking() {
  try {
    await locationTrackingService.initialize();
  } catch (error) {
    console.error('Failed to initialize location tracking:', error);
  }
}
