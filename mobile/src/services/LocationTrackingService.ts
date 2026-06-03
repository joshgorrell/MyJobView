import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { offlineStorage } from './OfflineStorage';

const LOCATION_TASK_NAME = 'background-location-task';
const GEOFENCE_TASK_NAME = 'geofence-task';

// Adaptive tracking settings based on battery and movement
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
  private geofences: Map<string, Location.LocationRegion> = new Map();

  async initialize() {
    // Request permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      throw new Error('Foreground location permission not granted');
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.warn('Background location permission not granted - limited functionality');
    }

    // Monitor battery level
    this.batteryLevel = await Battery.getBatteryLevelAsync();
    Battery.addBatteryLevelListener(({ batteryLevel }) => {
      this.batteryLevel = batteryLevel;
      this.adjustTrackingConfig();
    });

    // Define background location task
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

    // Define geofence task
    TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
      if (error) {
        console.error('Geofence error:', error);
        return;
      }

      if (data) {
        const { eventType, region } = data as any;
        await this.handleGeofenceEvent(eventType, region);
      }
    });
  }

  async startTracking(technicianId: string, clockEntryId: string) {
    if (this.isTracking) {
      console.log('Already tracking');
      return;
    }

    this.currentTechnicianId = technicianId;
    this.currentClockEntryId = clockEntryId;
    this.isTracking = true;

    const config = this.getTrackingConfig();

    try {
      // Start background location updates
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: config.accuracy,
        timeInterval: config.timeInterval,
        distanceInterval: config.distanceInterval,
        foregroundService: Platform.OS === 'android' ? {
          notificationTitle: 'Field Ops Pro - Tracking Active',
          notificationBody: 'Recording your location for work hours tracking',
          notificationColor: '#2563eb',
        } : undefined,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        deferredUpdatesInterval: 30000, // Batch updates every 30 seconds
        deferredUpdatesDistance: 50, // Or every 50 meters
      });

      // Capture initial location with high accuracy
      const initialLocation = await this.captureHighAccuracyLocation();
      if (initialLocation) {
        await this.saveLocationBreadcrumb(initialLocation, 'initial_clock_in');
      }

      console.log('Location tracking started successfully');
    } catch (error) {
      console.error('Failed to start location tracking:', error);
      this.isTracking = false;
      throw error;
    }
  }

  async stopTracking() {
    if (!this.isTracking) {
      return;
    }

    try {
      // Capture final location
      if (this.currentClockEntryId) {
        const finalLocation = await this.captureHighAccuracyLocation();
        if (finalLocation) {
          await this.saveLocationBreadcrumb(finalLocation, 'final_clock_out');
        }
      }

      // Stop background tracking
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (isTracking) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      this.isTracking = false;
      this.currentClockEntryId = null;
      this.currentTechnicianId = null;

      console.log('Location tracking stopped');
    } catch (error) {
      console.error('Failed to stop location tracking:', error);
    }
  }

  async captureHighAccuracyLocation(): Promise<Location.LocationObject | null> {
    const startTime = Date.now();
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        maximumAge: 1000,
        timeout: 15000,
      });

      const duration = Date.now() - startTime;
      this.lastKnownLocation = location;

      return {
        ...location,
        coords: {
          ...location.coords,
          // Add custom metadata
          duration_ms: duration,
          method: 'high_accuracy_request',
        } as any,
      };
    } catch (error) {
      console.error('Failed to get high accuracy location:', error);

      // Fallback to last known location
      if (this.lastKnownLocation) {
        return this.lastKnownLocation;
      }

      // Try balanced accuracy as last resort
      try {
        const location = await Location.getLastKnownPositionAsync({
          maxAge: 60000, // 1 minute
          requiredAccuracy: 100,
        });
        return location;
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

        // Check if we've entered/exited any geofences
        await this.checkGeofences(location);
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
      // Try to save to Supabase
      const { error } = await supabase
        .from('enhanced_gps_breadcrumbs')
        .insert(breadcrumb);

      if (error) throw error;
    } catch (error) {
      console.log('Saving breadcrumb offline:', error);
      // Save to offline storage
      await offlineStorage.saveBreadcrumb(breadcrumb);
    }
  }

  private getTrackingConfig(): TrackingConfig {
    // Adjust accuracy and frequency based on battery level
    if (this.batteryLevel < 0.15) {
      // Low battery - conserve power
      return {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 120000, // 2 minutes
        distanceInterval: 100, // 100 meters
      };
    } else if (this.batteryLevel < 0.30) {
      // Medium battery
      return {
        accuracy: Location.Accuracy.High,
        timeInterval: 60000, // 1 minute
        distanceInterval: 50, // 50 meters
      };
    } else {
      // Good battery - maximum accuracy
      return {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 30000, // 30 seconds
        distanceInterval: 25, // 25 meters
      };
    }
  }

  private async adjustTrackingConfig() {
    if (!this.isTracking) return;

    // Restart with new config
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);

      const config = this.getTrackingConfig();
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: config.accuracy,
        timeInterval: config.timeInterval,
        distanceInterval: config.distanceInterval,
        foregroundService: Platform.OS === 'android' ? {
          notificationTitle: 'Field Ops Pro - Tracking Active',
          notificationBody: `Recording location (Battery: ${Math.round(this.batteryLevel * 100)}%)`,
          notificationColor: '#2563eb',
        } : undefined,
      });
    }
  }

  async registerGeofence(jobSiteId: string, latitude: number, longitude: number, radius: number = 100) {
    const region: Location.LocationRegion = {
      identifier: jobSiteId,
      latitude,
      longitude,
      radius,
      notifyOnEnter: true,
      notifyOnExit: true,
    };

    this.geofences.set(jobSiteId, region);

    try {
      await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, [region]);
      console.log(`Geofence registered for job site ${jobSiteId}`);
    } catch (error) {
      console.error('Failed to register geofence:', error);
    }
  }

  async unregisterGeofence(jobSiteId: string) {
    this.geofences.delete(jobSiteId);

    if (this.geofences.size === 0) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    } else {
      // Re-register remaining geofences
      const regions = Array.from(this.geofences.values());
      await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
    }
  }

  private async handleGeofenceEvent(eventType: Location.GeofencingEventType, region: Location.LocationRegion) {
    console.log(`Geofence event: ${eventType} for ${region.identifier}`);

    const event = {
      job_site_id: region.identifier,
      technician_id: this.currentTechnicianId,
      event_type: eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit',
      timestamp: new Date().toISOString(),
      latitude: region.latitude,
      longitude: region.longitude,
    };

    try {
      const { error } = await supabase
        .from('geofence_events')
        .insert(event);

      if (error) throw error;

      // Trigger notification
      if (eventType === Location.GeofencingEventType.Enter) {
        // Technician arrived at job site
        console.log('Technician arrived at job site');
      }
    } catch (error) {
      console.error('Failed to save geofence event:', error);
      await offlineStorage.saveGeofenceEvent(event);
    }
  }

  private async checkGeofences(location: Location.LocationObject) {
    // Manual geofence checking for additional precision
    for (const [jobSiteId, region] of this.geofences.entries()) {
      const distance = this.calculateDistance(
        location.coords.latitude,
        location.coords.longitude,
        region.latitude,
        region.longitude
      );

      if (distance <= region.radius) {
        console.log(`Inside geofence: ${jobSiteId} (${distance}m)`);
      }
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  getCurrentLocation(): Location.LocationObject | null {
    return this.lastKnownLocation;
  }

  isCurrentlyTracking(): boolean {
    return this.isTracking;
  }
}

export const locationTrackingService = new LocationTrackingService();

export async function initializeLocationTracking() {
  try {
    await locationTrackingService.initialize();
    console.log('Location tracking service initialized');
  } catch (error) {
    console.error('Failed to initialize location tracking:', error);
  }
}
