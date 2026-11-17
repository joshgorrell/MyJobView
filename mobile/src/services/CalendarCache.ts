import * as SQLite from 'expo-sqlite';

// Read-only schedule snapshots. Never queue calendar changes or treat cached data as current.
export type CachedCalendarEvent = {
  id: string; date: string; start: string | null; end: string | null;
  title: string; subtitle: string;
  kind: 'job' | 'appointment' | 'internal' | 'time_off';
  workOrderId?: string;
};

type CacheRow = { events_json: string; fetched_at: string };
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
async function database() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('fieldops_offline.db');
      await db.execAsync(`CREATE TABLE IF NOT EXISTS cached_calendar_ranges (
        employee_id TEXT NOT NULL,
        range_start TEXT NOT NULL,
        range_end TEXT NOT NULL,
        events_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY(employee_id, range_start, range_end)
      );`);
      return db;
    })().catch(error => { dbPromise = null; throw error; });
  }
  return dbPromise;
}

export async function saveCalendarRange(employeeId: string, start: string, end: string, events: CachedCalendarEvent[]) {
  const db = await database();
  await db.runAsync(
    `INSERT INTO cached_calendar_ranges(employee_id, range_start, range_end, events_json, fetched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(employee_id, range_start, range_end) DO UPDATE SET
       events_json=excluded.events_json, fetched_at=excluded.fetched_at`,
    [employeeId, start, end, JSON.stringify(events), new Date().toISOString()],
  );
  // Keep only the most recently loaded 24 ranges per employee.
  await db.runAsync(
    `DELETE FROM cached_calendar_ranges WHERE employee_id = ? AND rowid NOT IN (
       SELECT rowid FROM cached_calendar_ranges WHERE employee_id = ?
       ORDER BY fetched_at DESC LIMIT 24)`,
    [employeeId, employeeId],
  );
}

export async function readCalendarRange(employeeId: string, start: string, end: string) {
  const db = await database();
  const row = await db.getFirstAsync<CacheRow>(
    'SELECT events_json, fetched_at FROM cached_calendar_ranges WHERE employee_id = ? AND range_start = ? AND range_end = ?',
    [employeeId, start, end],
  );
  if (!row) return null;
  const parsed: unknown = JSON.parse(row.events_json);
  if (!Array.isArray(parsed)) return null;
  return { events: parsed as CachedCalendarEvent[], fetchedAt: row.fetched_at };
}

/** Remove all persisted calendar details on sign-out, including other users'
 * snapshots left by prior sign-ins on this device. */
export async function clearCalendarCache() {
  const db = await database();
  await db.runAsync('DELETE FROM cached_calendar_ranges');
}
