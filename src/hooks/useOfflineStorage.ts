import { useEffect, useState } from 'react';
import { offlineStorage } from '../lib/offlineStorage';

export function useOfflineStorage<T>(
  storeName: string,
  fetchData: () => Promise<T[]>
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [isOffline]);

  async function loadData() {
    try {
      if (navigator.onLine) {
        // Fetch from API
        const freshData = await fetchData();
        setData(freshData);
        // Cache for offline use
        await offlineStorage.cacheData(storeName, freshData);
      } else {
        // Load from cache
        const cachedData = await offlineStorage.getCachedData(storeName);
        setData(cachedData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      // Try cache as fallback
      try {
        const cachedData = await offlineStorage.getCachedData(storeName);
        setData(cachedData);
      } catch (cacheError) {
        console.error('Error loading cached data:', cacheError);
      }
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, isOffline, refresh: loadData };
}
