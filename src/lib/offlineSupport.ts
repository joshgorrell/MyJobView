import { supabase } from './supabase';
import { offlineStorage } from './offlineStorage';
import { syncManager } from './syncManager';

export async function offlineSupabaseInsert<T>(
  table: string,
  data: any | any[]
): Promise<{ data: T | T[] | null; error: any }> {
  if (!navigator.onLine) {
    try {
      const records = Array.isArray(data) ? data : [data];
      const recordsWithIds: any[] = [];

      for (const record of records) {
        const recordWithId = {
          ...record,
          id: record.id || crypto.randomUUID(),
          created_at: record.created_at || new Date().toISOString(),
          synced: false,
        };

        await offlineStorage.addToSyncQueue({
          type: 'create',
          table,
          data: recordWithId,
        });

        recordsWithIds.push(recordWithId);

        const cached = await offlineStorage.getCachedData(table);
        await offlineStorage.cacheData(table, [...cached, recordWithId]);
      }

      return {
        data: (Array.isArray(data) ? recordsWithIds : recordsWithIds[0]) as any,
        error: null
      };
    } catch (error) {
      return { data: null, error };
    }
  }

  const result = await supabase.from(table).insert(data).select();

  if (!result.error) {
    try {
      const cached = await offlineStorage.getCachedData(table);
      const newData = Array.isArray(result.data) ? result.data : [result.data];
      await offlineStorage.cacheData(table, [...cached, ...newData]);
    } catch (e) {
      console.warn('Failed to cache data:', e);
    }
  }

  return result as any;
}

export async function offlineSupabaseUpdate<T>(
  table: string,
  data: any,
  id: string
): Promise<{ data: T | null; error: any }> {
  if (!navigator.onLine) {
    try {
      await offlineStorage.addToSyncQueue({
        type: 'update',
        table,
        data: { ...data, id },
      });

      const cached = await offlineStorage.getCachedData(table);
      const updated = cached.map((item: any) =>
        item.id === id ? { ...item, ...data, synced: false } : item
      );
      await offlineStorage.cacheData(table, updated);

      return { data: { ...data, id } as any, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  const result = await supabase
    .from(table)
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (!result.error) {
    try {
      const cached = await offlineStorage.getCachedData(table);
      const updated = cached.map((item: any) =>
        item.id === id ? result.data : item
      );
      await offlineStorage.cacheData(table, updated);
    } catch (e) {
      console.warn('Failed to cache data:', e);
    }
  }

  return result as any;
}

export async function offlineSupabaseDelete(
  table: string,
  id: string
): Promise<{ error: any }> {
  if (!navigator.onLine) {
    try {
      await offlineStorage.addToSyncQueue({
        type: 'delete',
        table,
        data: { id },
      });

      const cached = await offlineStorage.getCachedData(table);
      const filtered = cached.filter((item: any) => item.id !== id);
      await offlineStorage.cacheData(table, filtered);

      return { error: null };
    } catch (error) {
      return { error };
    }
  }

  const result = await supabase.from(table).delete().eq('id', id);

  if (!result.error) {
    try {
      const cached = await offlineStorage.getCachedData(table);
      const filtered = cached.filter((item: any) => item.id !== id);
      await offlineStorage.cacheData(table, filtered);
    } catch (e) {
      console.warn('Failed to cache data:', e);
    }
  }

  return result;
}

export async function offlineSupabaseQuery<T>(
  table: string,
  fetchFn: () => Promise<{ data: T[] | null; error: any }>
): Promise<{ data: T[] | null; error: any }> {
  if (!navigator.onLine) {
    try {
      const cached = await offlineStorage.getCachedData(table);
      return { data: cached as T[], error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  const result = await fetchFn();

  if (!result.error && result.data) {
    try {
      await offlineStorage.cacheData(table, result.data);
    } catch (e) {
      console.warn('Failed to cache data:', e);
    }
  }

  return result;
}

export async function triggerSync() {
  if (navigator.onLine) {
    await syncManager.syncQueuedActions();
  }
}
