import React, { createContext, useContext, useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { offlineStorage } from '../services/OfflineStorage';

interface OfflineContextType {
  isConnected: boolean;
  isOffline: boolean;
  pendingSync: number;
  syncNow: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);

  useEffect(() => {
    // Initialize offline storage
    offlineStorage.initialize().catch(console.error);

    // Monitor network status
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? false);

      // Auto-sync when connection restored
      if (state.isConnected) {
        syncNow();
      }
    });

    // Update pending sync count periodically
    const interval = setInterval(updatePendingCount, 5000);
    updatePendingCount();

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  async function updatePendingCount() {
    try {
      const breadcrumbs = await offlineStorage.getPendingBreadcrumbsCount();
      const events = await offlineStorage.getPendingClockEventsCount();
      setPendingSync(breadcrumbs + events);
    } catch (error) {
      console.error('Error updating pending count:', error);
    }
  }

  async function syncNow() {
    try {
      await offlineStorage.syncPendingData();
      await updatePendingCount();
    } catch (error) {
      console.error('Error syncing:', error);
    }
  }

  return (
    <OfflineContext.Provider
      value={{
        isConnected,
        isOffline: !isConnected,
        pendingSync,
        syncNow,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider');
  }
  return context;
}
