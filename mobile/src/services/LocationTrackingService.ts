import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { offlineStorage } from './OfflineStorage';

const LOCATION_TASK_NAME = 'field-ops-background-location';

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
  private taskDefined = false;

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

    this.defineBackgroundTask();
  }

  private defineBackgroundTask() {
    if (this.taskDefined) return;

    TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
      if (error) {
        console.error('Background location error:', error);
        return;
      }
      if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };
        await this.handleLocationUpdate(locations);
      }
    });

    this.taskDefined = true;
  }

  async startTracking(technicianId: string, clockEntryId: string) {
    if (this.isTracking) {
      // Already tracking — just update the IDs in case of a new clock entry
      this.currentTechnicianId = technicianId;
      this.currentClockEntryId = clockEntryId;
      return;
    }

    this.defineBackgroundTask();

    const config = this.getTrackingConfig();

    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: config.accuracy,
        timeInterval: config.timeInterval,
        distanceInterval: config.distanceInterval,
        foregroundService: Platform.OS === 'android' ? {
          notificationTitle: 'Field Ops Pro',
          notificationBody: 'Location services active',
          notificationColor: '#2563eb',
        } : undefined,
        showsBackgroundLocationIndicator: false,
      });

      this.isTracking = true;
      this.currentTechnicianId = technicianId;
      this.currentClockEntryId = clockEntryId;
    } catch (error) {
      console.error('Failed to start background tracking:', error);
    }
  }

  async stopTracking() {
    if (!this.isTracking) {
      return;
    }

    try {
      if (this.currentClockEntryId) {
        const finalLocation = await this.captureHighAccuracyLocation();
        if (finalLocation) {
          await this.saveLocationBreadcrumb(finalLocation, 'final_clock_out');
        }
      }

      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      this.isTracking = false;
      this.currentClockEntryId = null;
      this.currentTechnicianId = null;
    } catch (error) {
      console.error('Failed to stop location tracking:', error);
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
        maximumAge: 1000,
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

  private async handleLocationUpdate(locations: Location.LocationObject[]) {
    if (!this.currentClockEntryId || !this.currentTechnicianId) {
      return;
    }

    for (const location of locations) {
      try {
        await this.saveLocationBreadcrumb(location, 'background_update');
        this.lastKnownLocation = location;
      } catch (error) {
        console.error('Failed to handle location update:', error);
      }
    }
  }

  private async saveLocationBreadcrumb(
    location: Location.LocationObject,
    captureMethod: string
  ) {
    const deviceInfo = {
      model: Device.modelName,
      os: Platform.OS,
      osVersion: Device.osVersion,
    };

    const breadcrumb = {
      id: `${Date.now()}-${Math.random()}`,
      technician_id: this.currentTechnicianId,
      daily_clock_entry_id: this.currentClockEntryId,
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
      device_model: deviceInfo.model,
      os_version: `${deviceInfo.os} ${deviceInfo.osVersion}`,
    };

    try {
      const { error } = await supabase
        .from('enhanced_gps_breadcrumbs')
        .insert(breadcrumb);

      if (error) throw error;
    } catch (error) {
      await offlineStorage.saveBreadcrumb(breadcrumb as any);
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
          notificationTitle: 'Field Ops Pro',
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
