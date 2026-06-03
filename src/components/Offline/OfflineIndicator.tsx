import { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { syncManager } from '../../lib/syncManager';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showNotification, setShowNotification] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    let hideTimeout: NodeJS.Timeout;
    let offlineDelayTimeout: NodeJS.Timeout;

    const handleOnline = () => {
      setIsOnline(true);

      // Only show "back online" if we were previously offline with pending items
      if (wasOffline && queueLength > 0) {
        setShowNotification(true);
        hideTimeout = setTimeout(() => {
          setShowNotification(false);
          setWasOffline(false);
        }, 2000);
      } else {
        setWasOffline(false);
      }

      if (offlineDelayTimeout) clearTimeout(offlineDelayTimeout);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      if (hideTimeout) clearTimeout(hideTimeout);

      // Show notification after 3 seconds of being offline (not 2 minutes)
      offlineDelayTimeout = setTimeout(() => {
        setShowNotification(true);
      }, 3000);
    };

    const unsubscribe = syncManager.addListener((isSyncing, queue) => {
      setSyncing(isSyncing);
      setQueueLength(queue);

      // Only show during active syncing if there are pending items
      if (isSyncing && queue > 0) {
        setShowNotification(true);
        if (hideTimeout) clearTimeout(hideTimeout);
      } else if (!isSyncing && queue === 0 && navigator.onLine) {
        // Hide quickly once syncing is complete
        hideTimeout = setTimeout(() => {
          setShowNotification(false);
        }, 1500);
      }
    });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial queue length silently
    syncManager.getQueueLength().then(length => {
      setQueueLength(length);
      // Don't show notification on initial load unless offline
      if (!navigator.onLine && length > 0) {
        setShowNotification(true);
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
      if (hideTimeout) clearTimeout(hideTimeout);
      if (offlineDelayTimeout) clearTimeout(offlineDelayTimeout);
    };
  }, []);

  if (!showNotification && isOnline && !syncing && queueLength === 0) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[60] px-4 py-1.5 shadow-md transition-all duration-300 ${
        isOnline
          ? 'bg-green-500 text-white'
          : 'bg-red-500 text-white'
      }`}
    >
      <div className="flex items-center justify-center gap-2 max-w-7xl mx-auto">
        {!isOnline ? (
          <>
            <WifiOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="font-medium text-xs sm:text-sm">
              <span className="hidden sm:inline">You're offline - changes will be saved locally</span>
              <span className="sm:hidden">Offline mode</span>
            </span>
            {queueLength > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded-full text-xs">
                {queueLength} pending
              </span>
            )}
          </>
        ) : syncing ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 animate-spin" />
            <span className="font-medium text-xs sm:text-sm">
              Syncing changes...
            </span>
            {queueLength > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded-full text-xs">
                {queueLength} left
              </span>
            )}
          </>
        ) : queueLength > 0 ? (
          <>
            <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="font-medium text-xs sm:text-sm">
              {queueLength} changes pending sync
            </span>
          </>
        ) : (
          <>
            <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="font-medium text-xs sm:text-sm">
              <span className="hidden sm:inline">Back online - all changes synced</span>
              <span className="sm:hidden">Synced!</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
