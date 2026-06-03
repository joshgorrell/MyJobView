import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { offlineStorage } from '../lib/offlineStorage';

interface UseOfflineDataOptions<T> {
  table: string;
  select?: string;
  filter?: (query: any) => any;
  orderBy?: { column: string; ascending?: boolean };
}

export function useOfflineData<T>({ table, select = '*', filter, orderBy }: UseOfflineDataOptions<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (navigator.onLine) {
        let query = supabase.from(table).select(select);

        if (filter) {
          query = filter(query);
        }

        if (orderBy) {
          query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
        }

        const { data: fetchedData, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        const typedData = (fetchedData || []) as T[];
        setData(typedData);

        await offlineStorage.cacheData(table, typedData);
      } else {
        const cachedData = await offlineStorage.getCachedData(table);
        setData(cachedData as T[]);
      }
    } catch (err) {
      console.error(`Error fetching ${table}:`, err);
      setError(err as Error);

      try {
        const cachedData = await offlineStorage.getCachedData(table);
        setData(cachedData as T[]);
      } catch (cacheErr) {
        console.error(`Error reading cache for ${table}:`, cacheErr);
      }
    } finally {
      setLoading(false);
    }
  }, [table, select, filter, orderBy]);

  const create = useCallback(async (newData: Partial<T>) => {
    const tempId = crypto.randomUUID();
    const itemWithId = { ...newData, id: tempId } as T;

    setData(prev => [itemWithId, ...prev]);

    if (navigator.onLine) {
      try {
        const { data: createdData, error: createError } = await supabase
          .from(table)
          .insert(newData)
          .select()
          .single();

        if (createError) throw createError;

        setData(prev => prev.map(item =>
          (item as any).id === tempId ? createdData : item
        ));

        await fetchData();
      } catch (err) {
        console.error(`Error creating ${table}:`, err);
        await offlineStorage.addToSyncQueue({
          type: 'create',
          table,
          data: newData,
        });
      }
    } else {
      await offlineStorage.addToSyncQueue({
        type: 'create',
        table,
        data: newData,
      });
    }
  }, [table, fetchData]);

  const update = useCallback(async (id: string, updates: Partial<T>) => {
    setData(prev => prev.map(item =>
      (item as any).id === id ? { ...item, ...updates } : item
    ));

    if (navigator.onLine) {
      try {
        const { error: updateError } = await supabase
          .from(table)
          .update(updates)
          .eq('id', id);

        if (updateError) throw updateError;

        await fetchData();
      } catch (err) {
        console.error(`Error updating ${table}:`, err);
        await offlineStorage.addToSyncQueue({
          type: 'update',
          table,
          data: { id, ...updates },
        });
      }
    } else {
      await offlineStorage.addToSyncQueue({
        type: 'update',
        table,
        data: { id, ...updates },
      });
    }
  }, [table, fetchData]);

  const remove = useCallback(async (id: string) => {
    setData(prev => prev.filter(item => (item as any).id !== id));

    if (navigator.onLine) {
      try {
        const { error: deleteError } = await supabase
          .from(table)
          .delete()
          .eq('id', id);

        if (deleteError) throw deleteError;
      } catch (err) {
        console.error(`Error deleting ${table}:`, err);
        await offlineStorage.addToSyncQueue({
          type: 'delete',
          table,
          data: { id },
        });
      }
    } else {
      await offlineStorage.addToSyncQueue({
        type: 'delete',
        table,
        data: { id },
      });
    }
  }, [table]);

  useEffect(() => {
    fetchData();

    const handleOnline = () => {
      setIsOffline(false);
      fetchData();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    isOffline,
    create,
    update,
    remove,
    refresh: fetchData,
  };
}
