import { supabase } from './supabase';
import { updateClockEntryAddress } from './reverseGeocode';

interface GPSPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number;
  heading?: number;
  recorded_at: string;
}

interface QueuedGPSPoint extends GPSPoint {
  technician_id: string;
  daily_clock_entry_id?: string;
  work_order_id?: string;
}

interface GPSCaptureResult {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  method: 'high_accuracy' | 'network' | 'cached' | 'emergency' | 'failed' | 'none';
  duration_ms: number;
  attempted_at: string;
  captured_at: string | null;
}

interface PreWarmedLocation {
  position: GeolocationPosition;
  capturedAt: number;
  accuracy: number;
}

class GPSTrackingService {
  private watchId: number | null = null;
  private isTracking: boolean = false;
  private offlineQueue: QueuedGPSPoint[] = [];
  private syncInterval: NodeJS.Timeout | null = null;
  private recordInterval: NodeJS.Timeout | null = null;
  private lastPosition: GeolocationPosition | null = null;
  private lastCaptureTime: number = 0;
  private technicianId: string | null = null;
  private dailyClockEntryId: string | null = null;
  private workOrderId: string | null = null;
  private permissionState: PermissionState | null = null;
  private permissionChecked: boolean = false;
  private preWarmedLocation: PreWarmedLocation | null = null;
  private preWarmInterval: NodeJS.Timeout | null = null;
  private isPreWarming: boolean = false;
  private refinementWatchId: number | null = null;

  constructor() {
    this.loadOfflineQueue();
    window.addEventListener('online', () => this.syncOfflineQueue());
    this.checkPermissionStatus();
  }

  private async checkPermissionStatus() {
    if (!navigator.permissions || this.permissionChecked) {
      return;
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      this.permissionState = permission.state;
      this.permissionChecked = true;

      permission.addEventListener('change', () => {
        this.permissionState = permission.state;
      });
    } catch (error) {
      // Silently fail
    }
  }

  async hasPermission(): Promise<boolean> {
    if (!navigator.geolocation) {
      return false;
    }

    if (!navigator.permissions) {
      const declined = localStorage.getItem('gps_permission_declined');
      return declined !== 'true';
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return permission.state === 'granted';
    } catch (error) {
      return false;
    }
  }

  async getPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
    if (!navigator.geolocation) {
      return 'denied';
    }

    if (!navigator.permissions) {
      const declined = localStorage.getItem('gps_permission_declined');
      return declined === 'true' ? 'denied' : 'prompt';
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return permission.state;
    } catch (error) {
      return 'unknown';
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      await this.getCurrentLocation();
      localStorage.removeItem('gps_permission_declined');
      return true;
    } catch (error: any) {
      if (error.code === 1) {
        localStorage.setItem('gps_permission_declined', 'true');
      }
      return false;
    }
  }

  async captureLocationForClockEvent(isClockOut: boolean = false): Promise<GPSCaptureResult> {
    const startTime = Date.now();
    const attemptedAt = new Date().toISOString();

    if (!navigator.geolocation) {
      return {
        latitude: null,
        longitude: null,
        accuracy: null,
        method: 'none',
        duration_ms: Date.now() - startTime,
        attempted_at: attemptedAt,
        captured_at: null
      };
    }

    // Try to use pre-warmed location if available and fresh
    if (this.preWarmedLocation && (Date.now() - this.preWarmedLocation.capturedAt) < 30000) {
      // Pre-warmed location is less than 30 seconds old
      if (this.preWarmedLocation.accuracy < 100) {
        // Good accuracy, use it immediately
        return {
          latitude: this.preWarmedLocation.position.coords.latitude,
          longitude: this.preWarmedLocation.position.coords.longitude,
          accuracy: this.preWarmedLocation.position.coords.accuracy,
          method: 'high_accuracy',
          duration_ms: Date.now() - startTime,
          attempted_at: attemptedAt,
          captured_at: new Date(this.preWarmedLocation.position.timestamp).toISOString()
        };
      }
    }

    // Attempt 1: High accuracy with extended timeout (15 seconds)
    try {
      const result = await this.tryHighAccuracyGPS(15000);
      return {
        ...result,
        duration_ms: Date.now() - startTime,
        attempted_at: attemptedAt,
        captured_at: new Date().toISOString()
      };
    } catch (highAccError1) {
      console.log('First high-accuracy attempt failed, trying network...');

      // Attempt 2: Network-based with longer timeout (8 seconds)
      try {
        const result = await this.tryNetworkGPS(8000);
        return {
          ...result,
          duration_ms: Date.now() - startTime,
          attempted_at: attemptedAt,
          captured_at: new Date().toISOString()
        };
      } catch (networkError) {
        console.log('Network attempt failed, trying second high-accuracy...');

        // Attempt 3: Second high accuracy attempt (10 seconds)
        try {
          const result = await this.tryHighAccuracyGPS(10000);
          return {
            ...result,
            duration_ms: Date.now() - startTime,
            attempted_at: attemptedAt,
            captured_at: new Date().toISOString()
          };
        } catch (highAccError2) {
          console.log('Second high-accuracy failed, trying cached...');

          // Attempt 4: Use cached location if recent (within 2 minutes)
          if (this.lastPosition && (Date.now() - this.lastCaptureTime) < 120000) {
            return {
              latitude: this.lastPosition.coords.latitude,
              longitude: this.lastPosition.coords.longitude,
              accuracy: this.lastPosition.coords.accuracy,
              method: 'cached',
              duration_ms: Date.now() - startTime,
              attempted_at: attemptedAt,
              captured_at: new Date(this.lastPosition.timestamp).toISOString()
            };
          }

          // Attempt 5: Emergency fallback - get ANY location with no timeout
          console.log('Cached failed, trying emergency fallback...');
          try {
            const result = await this.tryEmergencyGPS();
            return {
              ...result,
              duration_ms: Date.now() - startTime,
              attempted_at: attemptedAt,
              captured_at: new Date().toISOString()
            };
          } catch (emergencyError) {
            // All attempts failed
            return {
              latitude: null,
              longitude: null,
              accuracy: null,
              method: 'failed',
              duration_ms: Date.now() - startTime,
              attempted_at: attemptedAt,
              captured_at: null
            };
          }
        }
      }
    }
  }

  private tryHighAccuracyGPS(timeout: number): Promise<{ latitude: number; longitude: number; accuracy: number; method: 'high_accuracy' }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('High accuracy timeout'));
      }, timeout);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          this.lastPosition = position;
          this.lastCaptureTime = Date.now();
          localStorage.removeItem('gps_permission_declined');
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            method: 'high_accuracy'
          });
        },
        (error) => {
          clearTimeout(timeoutId);
          if (error.code === 1) {
            localStorage.setItem('gps_permission_declined', 'true');
          }
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: timeout,
          maximumAge: 60000
        }
      );
    });
  }

  private tryNetworkGPS(timeout: number): Promise<{ latitude: number; longitude: number; accuracy: number; method: 'network' }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Network timeout'));
      }, timeout);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          this.lastPosition = position;
          this.lastCaptureTime = Date.now();
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            method: 'network'
          });
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        {
          enableHighAccuracy: false,
          timeout: timeout,
          maximumAge: 60000
        }
      );
    });
  }

  private tryEmergencyGPS(): Promise<{ latitude: number; longitude: number; accuracy: number; method: 'emergency' }> {
    return new Promise((resolve, reject) => {
      // Try to get ANY location, even if accuracy is poor
      // No timeout - wait as long as needed
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.lastPosition = position;
          this.lastCaptureTime = Date.now();
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            method: 'emergency'
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: false,
          timeout: 30000, // 30 second max for emergency
          maximumAge: 300000 // Accept location up to 5 minutes old
        }
      );
    });
  }

  // Pre-warm GPS before user clicks clock-in button
  startPreWarming() {
    if (this.isPreWarming || !navigator.geolocation) return;

    console.log('Starting GPS pre-warming...');
    this.isPreWarming = true;

    // Get initial location
    this.updatePreWarmedLocation();

    // Refresh every 15 seconds while pre-warming is active
    this.preWarmInterval = setInterval(() => {
      this.updatePreWarmedLocation();
    }, 15000);
  }

  stopPreWarming() {
    if (!this.isPreWarming) return;

    console.log('Stopping GPS pre-warming');
    this.isPreWarming = false;

    if (this.preWarmInterval) {
      clearInterval(this.preWarmInterval);
      this.preWarmInterval = null;
    }
  }

  private async updatePreWarmedLocation() {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5000
          }
        );
      });

      this.preWarmedLocation = {
        position,
        capturedAt: Date.now(),
        accuracy: position.coords.accuracy
      };

      console.log(`GPS pre-warmed: accuracy ${position.coords.accuracy.toFixed(1)}m`);
    } catch (error) {
      console.log('GPS pre-warming failed:', error);
    }
  }

  async startPostCaptureRefinement(entryId: string, isClockOut: boolean = false, tableName: 'daily_clock_entries' | 'time_entries' = 'daily_clock_entries') {
    if (!navigator.geolocation) return;

    const startTime = Date.now();
    const refinementDuration = 60000;
    let bestPosition: GeolocationPosition | null = null;
    let originalAccuracy: number | null = null;

    try {
      const { data } = await supabase
        .from(tableName)
        .select(isClockOut ? 'clock_out_gps_accuracy' : 'clock_in_gps_accuracy')
        .eq('id', entryId)
        .single();

      if (data) {
        originalAccuracy = isClockOut ? data.clock_out_gps_accuracy : data.clock_in_gps_accuracy;
      }
    } catch (error) {
      return;
    }

    if (!originalAccuracy) return;

    this.refinementWatchId = navigator.geolocation.watchPosition(
      async (position) => {
        const elapsed = Date.now() - startTime;

        if (elapsed > refinementDuration) {
          if (this.refinementWatchId !== null) {
            navigator.geolocation.clearWatch(this.refinementWatchId);
            this.refinementWatchId = null;
          }
          return;
        }

        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy * 0.5) {
          if (position.coords.accuracy < originalAccuracy * 0.5) {
            bestPosition = position;

            const updateData: Record<string, unknown> = {};
            if (isClockOut) {
              updateData.clock_out_latitude = position.coords.latitude;
              updateData.clock_out_longitude = position.coords.longitude;
              updateData.clock_out_gps_accuracy = position.coords.accuracy;
              updateData.clock_out_gps_refined = true;
              updateData.clock_out_gps_refined_at = new Date().toISOString();
              updateData.clock_out_gps_original_accuracy = originalAccuracy;
            } else {
              updateData.clock_in_latitude = position.coords.latitude;
              updateData.clock_in_longitude = position.coords.longitude;
              updateData.clock_in_gps_accuracy = position.coords.accuracy;
              updateData.clock_in_gps_refined = true;
              updateData.clock_in_gps_refined_at = new Date().toISOString();
              updateData.clock_in_gps_original_accuracy = originalAccuracy;
            }

            try {
              await supabase
                .from(tableName)
                .update(updateData)
                .eq('id', entryId);

              updateClockEntryAddress(entryId, position.coords.latitude, position.coords.longitude, isClockOut, tableName).catch(() => {});
            } catch (error) {
              console.error('Failed to save GPS refinement:', error);
            }
          }
        }
      },
      () => {},
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  stopPostCaptureRefinement() {
    if (this.refinementWatchId !== null) {
      navigator.geolocation.clearWatch(this.refinementWatchId);
      this.refinementWatchId = null;
      console.log('Post-capture refinement stopped');
    }
  }

  async startTracking(technicianId: string, dailyClockEntryId?: string, workOrderId?: string): Promise<boolean> {
    if (this.isTracking) {
      this.dailyClockEntryId = dailyClockEntryId;
      this.workOrderId = workOrderId;
      return true;
    }

    if (!navigator.geolocation) {
      return false;
    }

    const state = await this.getPermissionState();
    if (state === 'denied') {
      return false;
    }

    this.technicianId = technicianId;
    this.dailyClockEntryId = dailyClockEntryId;
    this.workOrderId = workOrderId;
    this.isTracking = true;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.lastPosition = position;
        this.lastCaptureTime = Date.now();
        localStorage.removeItem('gps_permission_declined');
      },
      (error) => {
        if (error.code === 1) {
          localStorage.setItem('gps_permission_declined', 'true');
          this.stopTracking();
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 60000
      }
    );

    this.recordInterval = setInterval(() => {
      if (this.lastPosition) {
        this.recordBreadcrumb(this.lastPosition);
      }
    }, 120000); // Record breadcrumb every 2 minutes

    this.syncInterval = setInterval(() => {
      this.syncOfflineQueue();
    }, 60000);

    return true;
  }

  stopTracking() {
    if (!this.isTracking) return;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.recordInterval) {
      clearInterval(this.recordInterval);
      this.recordInterval = null;
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.syncOfflineQueue();

    this.isTracking = false;
    this.technicianId = null;
    this.dailyClockEntryId = null;
    this.workOrderId = null;
  }

  updateWorkOrder(workOrderId: string | null) {
    this.workOrderId = workOrderId;
  }

  private async recordBreadcrumb(position: GeolocationPosition) {
    if (!this.technicianId) return;

    const point: QueuedGPSPoint = {
      technician_id: this.technicianId,
      daily_clock_entry_id: this.dailyClockEntryId,
      work_order_id: this.workOrderId,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed ?? undefined,
      heading: position.coords.heading ?? undefined,
      recorded_at: new Date(position.timestamp).toISOString()
    };

    if (navigator.onLine) {
      try {
        await this.saveBreadcrumb(point);
      } catch (error) {
        this.addToQueue(point);
      }
    } else {
      this.addToQueue(point);
    }
  }

  private async saveBreadcrumb(point: QueuedGPSPoint) {
    const { error } = await supabase
      .from('gps_breadcrumbs')
      .insert({
        technician_id: point.technician_id,
        daily_clock_entry_id: point.daily_clock_entry_id,
        work_order_id: point.work_order_id,
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
        speed: point.speed,
        heading: point.heading,
        recorded_at: point.recorded_at
      });

    if (error) throw error;
  }

  private addToQueue(point: QueuedGPSPoint) {
    this.offlineQueue.push(point);
    this.saveOfflineQueue();
  }

  private async syncOfflineQueue() {
    if (!navigator.onLine || this.offlineQueue.length === 0) return;

    const pointsToSync = [...this.offlineQueue];
    const failedPoints: QueuedGPSPoint[] = [];

    for (const point of pointsToSync) {
      try {
        await this.saveBreadcrumb(point);
      } catch (error) {
        failedPoints.push(point);
      }
    }

    this.offlineQueue = failedPoints;
    this.saveOfflineQueue();
  }

  private saveOfflineQueue() {
    try {
      localStorage.setItem('gps_offline_queue', JSON.stringify(this.offlineQueue));
    } catch (error) {
      // Silently fail
    }
  }

  private loadOfflineQueue() {
    try {
      const stored = localStorage.getItem('gps_offline_queue');
      if (stored) {
        this.offlineQueue = JSON.parse(stored);
      }
    } catch (error) {
      this.offlineQueue = [];
    }
  }

  getQueueSize(): number {
    return this.offlineQueue.length;
  }

  isCurrentlyTracking(): boolean {
    return this.isTracking;
  }

  getCurrentPosition(): GeolocationPosition | null {
    return this.lastPosition;
  }

  async getCurrentLocation(): Promise<GPSPoint> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed ?? undefined,
            heading: position.coords.heading ?? undefined,
            recorded_at: new Date(position.timestamp).toISOString()
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }
}

export const gpsTrackingService = new GPSTrackingService();
export default gpsTrackingService;
