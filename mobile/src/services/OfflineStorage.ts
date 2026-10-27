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
  private initializing: Promise<void> | null = null;

  async initialize() {
    if (this.initializing) return this.initializing;
    this.initializing = this.initializeDatabase().catch(error => {
      this.initializing = null;
      this.db = null;
      throw error;
    });
    return this.initializing;
  }

  private async initializeDatabase() {
    this.db = await SQLite.openDatabaseAsync('fieldops_offline.db');

    // Create tables
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_clock_gps (
        id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, technician_id TEXT NOT NULL, data_json TEXT NOT NULL
      );
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

      CREATE TABLE IF NOT EXISTS cached_employee_clock_policy (
        technician_id TEXT PRIMARY KEY,
        timezone TEXT NOT NULL,
        basis TEXT NOT NULL,
        daily_clock INTEGER NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cached_daily_clock_shifts (
        id TEXT PRIMARY KEY,
        technician_id TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        clock_in TEXT NOT NULL,
        clock_out TEXT,
        status TEXT NOT NULL,
        office_id TEXT,
        notes TEXT,
        sync_state TEXT NOT NULL,
        cached_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_cached_daily_clock_shifts_tech
        ON cached_daily_clock_shifts(technician_id, clock_in);

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
    if (!this.db) await this.initialize();

    await this.db!.runAsync(
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

  async saveEmployeeClockPolicy(technicianId: string, policy: {
    timezone: string; basis: string; dailyClock: boolean;
  }) {
    if (!this.db) await this.initialize();
    await this.db!.runAsync(
      `INSERT OR REPLACE INTO cached_employee_clock_policy
       (technician_id, timezone, basis, daily_clock, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
      [technicianId, policy.timezone, policy.basis, policy.dailyClock ? 1 : 0, new Date().toISOString()]
    );
  }

  async getEmployeeClockPolicy(technicianId: string) {
    if (!this.db) await this.initialize();
    const policy = await this.db!.getFirstAsync<{
      timezone: string; basis: string; daily_clock: number; fetched_at: string;
    }>('SELECT timezone, basis, daily_clock, fetched_at FROM cached_employee_clock_policy WHERE technician_id = ?', [technicianId]);
    return policy ? {
      timezone: policy.timezone, basis: policy.basis,
      dailyClock: policy.daily_clock === 1, fetchedAt: policy.fetched_at,
    } : null;
  }

  // Local shift snapshots are scoped to the signed-in technician. They are not
  // authoritative payroll entries until the server confirms synchronization.
  async saveLocalClockShift(shift: {
    id: string; technician_id: string; entry_date: string; clock_in: string;
    clock_out?: string | null; status: string; office_id?: string | null;
    notes?: string | null; sync_state: 'synced' | 'pending' | 'conflict';
  }) {
    if (!this.db) await this.initialize();
    await this.db!.runAsync(
      `INSERT INTO cached_daily_clock_shifts
        (id, technician_id, entry_date, clock_in, clock_out, status, office_id, notes, sync_state, cached_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          entry_date = excluded.entry_date,
          clock_in = excluded.clock_in,
          clock_out = excluded.clock_out,
          status = excluded.status,
          office_id = excluded.office_id,
          notes = excluded.notes,
          sync_state = excluded.sync_state,
          cached_at = CURRENT_TIMESTAMP
        WHERE cached_daily_clock_shifts.sync_state = 'synced'
          AND cached_daily_clock_shifts.technician_id = excluded.technician_id`,
      [shift.id, shift.technician_id, shift.entry_date, shift.clock_in,
        shift.clock_out ?? null, shift.status, shift.office_id ?? null,
        shift.notes ?? null, shift.sync_state]
    );
  }

  async getLocalActiveClockShift(technicianId: string) {
    if (!this.db) await this.initialize();
    return this.db!.getFirstAsync<{
      id: string; technician_id: string; entry_date: string; clock_in: string;
      clock_out: string | null; status: string; office_id: string | null;
      notes: string | null; sync_state: string;
    }>(
      `SELECT id, technician_id, entry_date, clock_in, clock_out, status,
        office_id, notes, sync_state FROM cached_daily_clock_shifts
        WHERE technician_id = ? AND clock_out IS NULL
        ORDER BY clock_in DESC LIMIT 1`,
      [technicianId]
    );
  }

  // A pending or conflicting completed shift must remain visible even when
  // the server no longer has an open shift to return.
  async getUnresolvedClockShift(technicianId: string) {
    if (!this.db) await this.initialize();
    return this.db!.getFirstAsync<{
      id: string; technician_id: string; entry_date: string; clock_in: string;
      clock_out: string | null; status: string; office_id: string | null;
      notes: string | null; sync_state: string;
    }>(
      `SELECT * FROM cached_daily_clock_shifts
       WHERE technician_id = ? AND sync_state IN ('pending', 'conflict')
       ORDER BY clock_in DESC LIMIT 1`,
      [technicianId]
    );
  }

  async getLocalClockShift(technicianId: string, shiftId: string) {
    if (!this.db) await this.initialize();
    return this.db!.getFirstAsync<{
      id: string; technician_id: string; entry_date: string; clock_in: string;
      clock_out: string | null; status: string; office_id: string | null;
      notes: string | null; sync_state: string;
    }>(
      'SELECT * FROM cached_daily_clock_shifts WHERE technician_id = ? AND id = ?',
      [technicianId, shiftId]
    );
  }

  // Called only after the UI has established that the device is offline.
  // Persist shift and outbound event in one SQLite transaction to avoid
  // losing either half of a clock operation during an app interruption.
  async recordOfflineClockTransition(shift: {
    id: string; technician_id: string; entry_date: string; clock_in: string;
    clock_out?: string | null; status: 'clocked_in' | 'clocked_out';
    office_id?: string | null; notes?: string | null;
  }) {
    if (!this.db) await this.initialize();
    const policy = await this.getEmployeeClockPolicy(shift.technician_id);
    const age = policy ? Date.now() - Date.parse(policy.fetchedAt) : Infinity;
    if (!policy?.dailyClock || !Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000) {
      throw new Error('A recently verified daily clock policy is required before offline clocking.');
    }
    if (!shift.clock_in || !Number.isFinite(Date.parse(shift.clock_in)) ||
        (shift.clock_out && (!Number.isFinite(Date.parse(shift.clock_out)) ||
          Date.parse(shift.clock_out) < Date.parse(shift.clock_in)))) {
      throw new Error('Invalid shift timestamps');
    }
    await this.db!.withExclusiveTransactionAsync(async tx => {
      const existing = await tx.getFirstAsync<{ id: string; clock_out: string | null }>(
        'SELECT id, clock_out FROM cached_daily_clock_shifts WHERE technician_id = ? AND clock_out IS NULL LIMIT 1',
        [shift.technician_id]
      );
      if (shift.status === 'clocked_in' && existing) {
        throw new Error('An active local shift already exists. Resolve it before clocking in again.');
      }
      if (shift.status === 'clocked_out' && (!existing || existing.id !== shift.id || !shift.clock_out)) {
        throw new Error('No matching active local shift was found for clock-out.');
      }
      await tx.runAsync(
        `INSERT OR REPLACE INTO pending_clock_events
         (id, technician_id, entry_date, clock_in, clock_out, status, office_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [shift.id, shift.technician_id, shift.entry_date, shift.clock_in,
          shift.clock_out ?? null, shift.status, shift.office_id ?? null, shift.notes ?? null]
      );
      await tx.runAsync(
        `INSERT OR REPLACE INTO cached_daily_clock_shifts
         (id, technician_id, entry_date, clock_in, clock_out, status, office_id, notes, sync_state, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
        [shift.id, shift.technician_id, shift.entry_date, shift.clock_in,
          shift.clock_out ?? null, shift.status, shift.office_id ?? null, shift.notes ?? null]
      );
    });
  }

  async saveClockEvent(event: PendingClockEvent) {
    if (!this.db) await this.initialize();

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
          wo.assigned_to,
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

  async saveClockGps(id: string, entryId: string, technicianId: string, values: Record<string, unknown>) {
    if (!this.db) await this.initialize();
    await this.db!.runAsync('INSERT OR REPLACE INTO pending_clock_gps(id,entry_id,technician_id,data_json) VALUES(?,?,?,?)', [id, entryId, technicianId, JSON.stringify(values)]);
  }
  async removeClockGps(id: string) {
    if (this.db) await this.db.runAsync('DELETE FROM pending_clock_gps WHERE id=?', [id]);
  }
  private async syncClockGps() {
    if (!this.db) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const rows = await this.db.getAllAsync<{id:string;entry_id:string;technician_id:string;data_json:string}>('SELECT * FROM pending_clock_gps WHERE technician_id=?', [session.user.id]);
    for (const row of rows) {
      // GPS evidence must never be attached to a shift whose offline clock
      // transition is still pending or has conflicted with the server.
      const pending = await this.db.getFirstAsync<{ id: string }>(
        'SELECT id FROM pending_clock_events WHERE id = ? AND technician_id = ?',
        [row.entry_id, row.technician_id]
      );
      const local = await this.db.getFirstAsync<{ sync_state: string }>(
        'SELECT sync_state FROM cached_daily_clock_shifts WHERE id = ? AND technician_id = ?',
        [row.entry_id, row.technician_id]
      );
      if (pending || (local && local.sync_state !== 'synced')) continue;
      const { data, error } = await supabase.from('daily_clock_entries')
        .update(JSON.parse(row.data_json))
        .eq('id', row.entry_id).eq('technician_id', row.technician_id)
        .select('id');
      if (!error && data?.length) await this.removeClockGps(row.id);
    }
  }
  async syncPendingData() {
    if (!this.db) await this.initialize();
    if (this.syncInProgress) {
      console.log('Sync already in progress');
      return;
    }

    this.syncInProgress = true;
    console.log('Starting offline data sync...');

    try {
      await this.syncClockEvents();
      await this.syncClockGps();
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const events: any[] = await this.db.getAllAsync('SELECT * FROM pending_clock_events WHERE technician_id = ?', [session.user.id]);

    for (const event of events) {
      try {
        // Never replay an offline clock event over an already-recorded shift.
        // Conflicting records require explicit reconciliation, not an overwrite.
        const { data: existing, error: lookupError } = await supabase
          .from('daily_clock_entries')
          .select('id, clock_in, clock_out')
          .eq('id', event.id)
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (existing) {
          // PostgreSQL timestamptz is returned in canonical form, which may
          // differ from the ISO text originally persisted on the device.
          const sameInstant = (a: string | null | undefined, b: string | null | undefined) =>
            a == null || b == null ? a == null && b == null :
              Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);
          let reconciled = sameInstant(existing.clock_in, event.clock_in) &&
            sameInstant(existing.clock_out, event.clock_out);
          if (!reconciled && event.status === 'clocked_out' && event.clock_out &&
              sameInstant(existing.clock_in, event.clock_in) && existing.clock_out == null &&
              Date.parse(event.clock_out) > Date.parse(event.clock_in)) {
            // Close only the original, still-open, unadjusted shift. The
            // database's existing UPDATE trigger calculates payroll hours.
            // Do not replace administrative adjustments or approved shifts.
            const { data: closed, error: closeError } = await supabase
              .from('daily_clock_entries')
              .update({ clock_out: event.clock_out, status: 'clocked_out' })
              .eq('id', event.id)
              .eq('technician_id', event.technician_id)
              .eq('clock_in', existing.clock_in)
              .is('clock_out', null)
              .eq('status', 'clocked_in')
              .eq('admin_adjusted', false)
              .eq('admin_reviewed', false)
              .select('id, clock_in, clock_out');
            if (closeError) throw closeError;
            reconciled = !!closed?.some(row =>
              sameInstant(row.clock_in, event.clock_in) && sameInstant(row.clock_out, event.clock_out));
          }
          if (reconciled) {
            await this.db.runAsync('DELETE FROM pending_clock_events WHERE id = ? AND technician_id = ?', [event.id, event.technician_id]);
            await this.db.runAsync(
              "UPDATE cached_daily_clock_shifts SET sync_state = 'synced' WHERE id = ? AND technician_id = ? AND sync_state = 'pending'",
              [event.id, event.technician_id]
            );
          } else {
            await this.db.runAsync(
              "UPDATE cached_daily_clock_shifts SET sync_state = 'conflict' WHERE id = ? AND technician_id = ?",
              [event.id, event.technician_id]
            );
            console.warn(`Offline clock event ${event.id} differs from the server; manual reconciliation required`);
          }
          continue;
        }
        // An offline-created shift may conflict with a shift started on
        // another device. Never try to insert it over an existing open shift:
        // preserve the local punch and flag it for manual reconciliation.
        const { data: otherOpen, error: otherOpenError } = await supabase
          .from('daily_clock_entries')
          .select('id')
          .eq('technician_id', event.technician_id)
          .is('clock_out', null)
          .neq('id', event.id)
          .limit(1);
        if (otherOpenError) throw otherOpenError;
        if (otherOpen?.length) {
          await this.db.runAsync(
            "UPDATE cached_daily_clock_shifts SET sync_state = 'conflict' WHERE id = ? AND technician_id = ?",
            [event.id, event.technician_id]
          );
          console.warn(`Offline shift ${event.id} conflicts with another active server shift; manual reconciliation required`);
          continue;
        }
        const { error } = await supabase
          .from('daily_clock_entries')
          .insert({
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
        await this.db.runAsync('DELETE FROM pending_clock_events WHERE id = ? AND technician_id = ?', [event.id, event.technician_id]);
        await this.db.runAsync(
          "UPDATE cached_daily_clock_shifts SET sync_state = 'synced' WHERE id = ? AND technician_id = ? AND sync_state = 'pending'",
          [event.id, event.technician_id]
        );
        console.log(`Synced clock event: ${event.id}`);
      } catch (error) {
        console.error(`Failed to sync clock event ${event.id}:`, error);
      }
    }
  }

  private async syncBreadcrumbs() {
    if (!this.db) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Get breadcrumbs in batches
    const breadcrumbs: any[] = await this.db.getAllAsync(
      'SELECT * FROM pending_breadcrumbs WHERE technician_id = ? ORDER BY captured_at LIMIT 100',
      [session.user.id]
    );

    if (breadcrumbs.length === 0) return;

    try {
      // Batch insert
      const { error } = await supabase
        .from('enhanced_gps_breadcrumbs')
        .upsert(breadcrumbs.map(b => ({
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
        })), { onConflict: 'id', ignoreDuplicates: true });

      if (error) throw error;

      // Delete synced breadcrumbs
      const ids = breadcrumbs.map(b => b.id);
      await this.db.runAsync(
        `DELETE FROM pending_breadcrumbs WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );

      console.log(`Synced ${breadcrumbs.length} breadcrumbs`);

      // If there are more, sync again
      const remaining = await this.db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM pending_breadcrumbs WHERE technician_id = ?', [session.user.id]);
      if ((remaining?.count ?? 0) > 0) {
        await this.syncBreadcrumbs();
      }
    } catch (error) {
      console.error('Failed to sync breadcrumbs:', error);
    }
  }

  private async syncGeofenceEvents() {
    if (!this.db) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const events: any[] = await this.db.getAllAsync('SELECT * FROM pending_geofence_events WHERE technician_id = ?', [session.user.id]);

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
