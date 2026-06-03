import * as SQLite from 'expo-sqlite';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';

interface PendingBreadcrumb {
  id: string;
  technician_id: string;
  daily_clock_entry_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  altitude_accuracy: number | null;
  heading: number | null;
  speed: number | null;
  captured_at: string;
  capture_method: string;
  battery_level: number;
  device_model: string | null;
  os_version: string | null;
}

interface PendingClockEvent {
  id: string;
  technician_id: string;
  entry_date: string;
  clock_in?: string;
  clock_out?: string;
  status: string;
  office_id: string | null;
  notes?: string;
  clock_out_photo_url?: string;
}

class OfflineStorage {
  private db: SQLite.SQLiteDatabase | null = null;
  private syncInProgress = false;

  async initialize() {
    this.db = await SQLite.openDatabaseAsync('fieldops_offline.db');

    // Create tables
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_breadcrumbs (
        id TEXT PRIMARY KEY,
        technician_id TEXT NOT NULL,
        daily_clock_entry_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        altitude REAL,
        accuracy REAL,
        altitude_accuracy REAL,
        heading REAL,
        speed REAL,
        captured_at TEXT NOT NULL,
        capture_method TEXT NOT NULL,
        battery_level REAL NOT NULL,
        device_model TEXT,
        os_version TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pending_clock_events (
        id TEXT PRIMARY KEY,
        technician_id TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        clock_in TEXT,
        clock_out TEXT,
        status TEXT NOT NULL,
        office_id TEXT,
        notes TEXT,
        clock_out_photo_url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pending_geofence_events (
        id TEXT PRIMARY KEY,
        job_site_id TEXT NOT NULL,
        technician_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cached_work_orders (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        work_order_number TEXT NOT NULL,
        work_order_type TEXT NOT NULL,
        status TEXT NOT NULL,
        assigned_technician_id TEXT,
        scheduled_date TEXT,
        address TEXT,
        customer_name TEXT,
        description TEXT,
        data_json TEXT NOT NULL,
        cached_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_pending_breadcrumbs_entry
        ON pending_breadcrumbs(daily_clock_entry_id);
      CREATE INDEX IF NOT EXISTS idx_pending_clock_events_tech
        ON pending_clock_events(technician_id);
      CREATE INDEX IF NOT EXISTS idx_cached_work_orders_tech
        ON cached_work_orders(assigned_technician_id);
    `);

    // Set up automatic sync when connection restored
    NetInfo.addEventListener(state => {
      if (state.isConnected && !this.syncInProgress) {
        this.syncPendingData();
      }
    });

    console.log('Offline storage initialized');
  }

  async saveBreadcrumb(breadcrumb: PendingBreadcrumb) {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `INSERT INTO pending_breadcrumbs (
        id, technician_id, daily_clock_entry_id, latitude, longitude,
        altitude, accuracy, altitude_accuracy, heading, speed,
        captured_at, capture_method, battery_level, device_model, os_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        breadcrumb.id,
        breadcrumb.technician_id,
        breadcrumb.daily_clock_entry_id,
        breadcrumb.latitude,
        breadcrumb.longitude,
        breadcrumb.altitude,
        breadcrumb.accuracy,
        breadcrumb.altitude_accuracy,
        breadcrumb.heading,
        breadcrumb.speed,
        breadcrumb.captured_at,
        breadcrumb.capture_method,
        breadcrumb.battery_level,
        breadcrumb.device_model,
        breadcrumb.os_version,
      ]
    );
  }

  async saveClockEvent(event: PendingClockEvent) {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `INSERT OR REPLACE INTO pending_clock_events (
        id, technician_id, entry_date, clock_in, clock_out, status, office_id, notes, clock_out_photo_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.technician_id,
        event.entry_date,
        event.clock_in || null,
        event.clock_out || null,
        event.status,
        event.office_id,
        event.notes || null,
        event.clock_out_photo_url || null,
      ]
    );
  }

  async saveGeofenceEvent(event: any) {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `INSERT INTO pending_geofence_events (
        id, job_site_id, technician_id, event_type, timestamp, latitude, longitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `${Date.now()}-${Math.random()}`,
        event.job_site_id,
        event.technician_id,
        event.event_type,
        event.timestamp,
        event.latitude,
        event.longitude,
      ]
    );
  }

  async cacheWorkOrders(workOrders: any[]) {
    if (!this.db) throw new Error('Database not initialized');

    // Clear existing cache
    await this.db.runAsync('DELETE FROM cached_work_orders');

    // Insert new cache
    for (const wo of workOrders) {
      await this.db.runAsync(
        `INSERT INTO cached_work_orders (
          id, project_id, work_order_number, work_order_type, status,
          assigned_technician_id, scheduled_date, address, customer_name, description, data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          wo.id,
          wo.project_id,
          wo.work_order_number,
          wo.work_order_type,
          wo.status,
          wo.assigned_technician_id,
          wo.scheduled_date,
          wo.address,
          wo.customer_name,
          wo.description,
          JSON.stringify(wo),
        ]
      );
    }
  }

  async getCachedWorkOrders(technicianId: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      'SELECT data_json FROM cached_work_orders WHERE assigned_technician_id = ? ORDER BY scheduled_date',
      [technicianId]
    );

    return result.map((row: any) => JSON.parse(row.data_json));
  }

  async getPendingBreadcrumbsCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const result: any = await this.db.getFirstAsync(
      'SELECT COUNT(*) as count FROM pending_breadcrumbs'
    );

    return result?.count || 0;
  }

  async getPendingClockEventsCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const result: any = await this.db.getFirstAsync(
      'SELECT COUNT(*) as count FROM pending_clock_events'
    );

    return result?.count || 0;
  }

  async syncPendingData() {
    if (this.syncInProgress) {
      console.log('Sync already in progress');
      return;
    }

    this.syncInProgress = true;
    console.log('Starting offline data sync...');

    try {
      await this.syncClockEvents();
      await this.syncBreadcrumbs();
      await this.syncGeofenceEvents();
      console.log('Offline sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  private async syncClockEvents() {
    if (!this.db) return;

    const events: any[] = await this.db.getAllAsync('SELECT * FROM pending_clock_events');

    for (const event of events) {
      try {
        const { error } = await supabase
          .from('daily_clock_entries')
          .upsert({
            id: event.id,
            technician_id: event.technician_id,
            entry_date: event.entry_date,
            clock_in: event.clock_in,
            clock_out: event.clock_out,
            status: event.status,
            office_id: event.office_id,
            notes: event.notes,
            clock_out_photo_url: event.clock_out_photo_url,
            offline_entry: true,
          });

        if (error) throw error;

        // Delete synced event
        await this.db.runAsync('DELETE FROM pending_clock_events WHERE id = ?', [event.id]);
        console.log(`Synced clock event: ${event.id}`);
      } catch (error) {
        console.error(`Failed to sync clock event ${event.id}:`, error);
      }
    }
  }

  private async syncBreadcrumbs() {
    if (!this.db) return;

    // Get breadcrumbs in batches
    const breadcrumbs: any[] = await this.db.getAllAsync(
      'SELECT * FROM pending_breadcrumbs ORDER BY captured_at LIMIT 100'
    );

    if (breadcrumbs.length === 0) return;

    try {
      // Batch insert
      const { error } = await supabase
        .from('enhanced_gps_breadcrumbs')
        .insert(breadcrumbs.map(b => ({
          id: b.id,
          technician_id: b.technician_id,
          daily_clock_entry_id: b.daily_clock_entry_id,
          latitude: b.latitude,
          longitude: b.longitude,
          altitude: b.altitude,
          accuracy: b.accuracy,
          altitude_accuracy: b.altitude_accuracy,
          heading: b.heading,
          speed: b.speed,
          captured_at: b.captured_at,
          capture_method: b.capture_method,
          battery_level: b.battery_level,
          device_model: b.device_model,
          os_version: b.os_version,
        })));

      if (error) throw error;

      // Delete synced breadcrumbs
      const ids = breadcrumbs.map(b => b.id);
      await this.db.runAsync(
        `DELETE FROM pending_breadcrumbs WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );

      console.log(`Synced ${breadcrumbs.length} breadcrumbs`);

      // If there are more, sync again
      const remaining = await this.getPendingBreadcrumbsCount();
      if (remaining > 0) {
        await this.syncBreadcrumbs();
      }
    } catch (error) {
      console.error('Failed to sync breadcrumbs:', error);
    }
  }

  private async syncGeofenceEvents() {
    if (!this.db) return;

    const events: any[] = await this.db.getAllAsync('SELECT * FROM pending_geofence_events');

    for (const event of events) {
      try {
        const { error } = await supabase
          .from('geofence_events')
          .insert({
            job_site_id: event.job_site_id,
            technician_id: event.technician_id,
            event_type: event.event_type,
            timestamp: event.timestamp,
            latitude: event.latitude,
            longitude: event.longitude,
          });

        if (error) throw error;

        await this.db.runAsync('DELETE FROM pending_geofence_events WHERE id = ?', [event.id]);
        console.log(`Synced geofence event: ${event.id}`);
      } catch (error) {
        console.error(`Failed to sync geofence event ${event.id}:`, error);
      }
    }
  }
}

export const offlineStorage = new OfflineStorage();
