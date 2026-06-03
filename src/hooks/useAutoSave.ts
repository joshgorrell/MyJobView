import { useEffect, useRef } from 'react';

interface UseAutoSaveOptions<T> {
  key: string;
  data: T;
  enabled?: boolean;
  delay?: number;
}

export function useAutoSave<T>({ key, data, enabled = true, delay = 1000 }: UseAutoSaveOptions<T>) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const storageKey = `autosave_${key}`;

  // Auto-save data to localStorage with debounce
  useEffect(() => {
    if (!enabled) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error('Error auto-saving form data:', error);
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, enabled, delay, storageKey]);

  // Function to restore saved data
  const restoreSavedData = (): T | null => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return null;

      const parsed = JSON.parse(saved);

      // Check if data is less than 24 hours old
      const age = Date.now() - parsed.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (age > maxAge) {
        localStorage.removeItem(storageKey);
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error('Error restoring saved data:', error);
      return null;
    }
  };

  // Function to clear saved data
  const clearSavedData = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Error clearing saved data:', error);
    }
  };

  return {
    restoreSavedData,
    clearSavedData
  };
}
