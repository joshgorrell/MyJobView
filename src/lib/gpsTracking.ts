import { supabase } from './supabase';

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

class GPSTrackingService {
  private watchId: number | null = null;
  private isTracking: boolean = false;
  private offlineQueue: QueuedGPSPoint[] = [];
  private syncInterval: NodeJS.Timeout | null = null;
  private recordInterval: NodeJS.Timeout | null = null;
  private lastPosition: GeolocationPosition | null = null;
  private dailyClockEntryId: string | null = null;
  private workOrderId: string | null = null;
  private permissionState: PermissionState | null = null;
  private permissionChecked: boolean = false;
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

  async captureLocationForClockEvent(_isClockOut: boolean = false): Promise<GPSCaptureResult> {
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

    const permission = await this.getPermissionState();
    this.permissionState = permission === 'unknown' ? null : permission;
    if (this.permissionState === 'denied') {
      return {latitude:null,longitude:null,accuracy:null,method:'failed',duration_ms:Date.now()-startTime,attempted_at:attemptedAt,captured_at:null};
    }

    // Attempt 1: High accuracy with extended timeout (15 seconds)
    try {
      const result = await this.tryHighAccuracyGPS(15000);
      return {
        ...result,
        duration_ms: Date.now() - startTime,
        attempted_at: attemptedAt,
        captured_at: result.captured_at
      };
    } catch (highAccError1) {
      if ((highAccError1 as GeolocationPositionError)?.code === 1) return {latitude:null,longitude:null,accuracy:null,method:'failed',duration_ms:Date.now()-startTime,attempted_at:attemptedAt,captured_at:null};
      console.log('First high-accuracy attempt failed, trying network...');

      // Attempt 2: Network-based with longer timeout (8 seconds)
      try {
        const result = await this.tryNetworkGPS(8000);
        return {
          ...result,
          duration_ms: Date.now() - startTime,
          attempted_at: attemptedAt,
          captured_at: result.captured_at
        };
      } catch (networkError) {
          if ((networkError as GeolocationPositionError)?.code === 1) return {latitude:null,longitude:null,accuracy:null,method:'failed',duration_ms:Date.now()-startTime,attempted_at:attemptedAt,captured_at:null};
        console.log('Network attempt failed, trying second high-accuracy...');

        // Attempt 3: Second high accuracy attempt (10 seconds)
        try {
          const result = await this.tryHighAccuracyGPS(10000);
          return {
            ...result,
            duration_ms: Date.now() - startTime,
            attempted_at: attemptedAt,
            captured_at: result.captured_at
          };
        } catch (highAccError2) {
          if ((highAccError2 as GeolocationPositionError)?.code === 1) return {latitude:null,longitude:null,accuracy:null,method:'failed',duration_ms:Date.now()-startTime,attempted_at:attemptedAt,captured_at:null};
          console.log('Second high-accuracy failed, trying cached...');

          // Only use a reading from the last 30 seconds.
          if (this.lastPosition && (Date.now() - this.lastPosition.timestamp) < 30000) {
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
              captured_at: result.captured_at
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

  private tryHighAccuracyGPS(timeout: number): Promise<{ latitude: number; longitude: number; accuracy: number; method: 'high_accuracy'; captured_at: string }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('High accuracy timeout'));
      }, timeout);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          this.lastPosition = position;

          localStorage.removeItem('gps_permission_declined');
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            method: 'high_accuracy',
            captured_at: new Date(position.timestamp).toISOString()
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
          maximumAge: 0
        }
      );
    });
  }

  private tryNetworkGPS(timeout: number): Promise<{ latitude: number; longitude: number; accuracy: number; method: 'network'; captured_at: string }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Network timeout'));
      }, timeout);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          this.lastPosition = position;

          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            method: 'network',
            captured_at: new Date(position.timestamp).toISOString()
          });
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        {
          enableHighAccuracy: false,
          timeout: timeout,
          maximumAge: 0
        }
      );
    });
  }

  private tryEmergencyGPS(): Promise<{ latitude: number; longitude: number; accuracy: number; method: 'emergency'; captured_at: string }> {
    return new Promise((resolve, reject) => {
      // Try to get ANY location, even if accuracy is poor
      // No timeout - wait as long as needed
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.lastPosition = position;

          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            method: 'emergency',
            captured_at: new Date(position.timestamp).toISOString()
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: false,
          timeout: 30000, // 30 second max for emergency
          maximumAge: 0 // A clock event requires a fresh reading
        }
      );
    });
  }

  // Pre-warm GPS before user clicks clock-in button
  startPreWarming() {
    // Location capture is restricted to explicit clock actions.
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

  async startPostCaptureRefinement(_entryId: string, _isClockOut = false, _tableName: 'daily_clock_entries' | 'time_entries' = 'daily_clock_entries') {
    // Retired: later positions must never replace the clock-action reading.
  }

  stopPostCaptureRefinement() {
    if (this.refinementWatchId !== null) {
      navigator.geolocation.clearWatch(this.refinementWatchId);
      this.refinementWatchId = null;
      console.log('Post-capture refinement stopped');
    }
  }

  async startTracking(_technicianId: string, _dailyClockEntryId?: string, _workOrderId?: string): Promise<boolean> {
    // Retired: web clock actions record one reading, never a location trail.
    return false;
  }

  stopTracking(context?: 'daily' | 'job') {
    if (!this.isTracking) return;
    if (context === 'job') {
      this.workOrderId = null;
      if (this.dailyClockEntryId) return;
    }
    if (context === 'daily') {
      this.dailyClockEntryId = null;
      if (this.workOrderId) return;
    }

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
    this.dailyClockEntryId = null;
    this.workOrderId = null;
  }

  updateWorkOrder(workOrderId: string | null) {
    this.workOrderId = workOrderId ?? null;
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
