import React, { useState, useEffect } from 'react';
import { MapPin, Wifi, WifiOff, Eye, EyeOff, Navigation } from 'lucide-react';
import { gpsTrackingService } from '../../lib/gpsTracking';
import { useAuth } from '../../contexts/AuthContext';

interface GPSTrackerProps {
  dailyClockEntryId?: string;
  workOrderId?: string;
  autoStart?: boolean;
}

export function GPSTracker({ dailyClockEntryId, workOrderId, autoStart = false }: GPSTrackerProps) {
  const { profile } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [queueSize, setQueueSize] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');

  useEffect(() => {
    checkLocationPermission();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (autoStart && profile && locationPermission === 'granted') {
      handleStartTracking();
    }
  }, [autoStart, profile, locationPermission]);

  useEffect(() => {
    if (!isTracking) return;

    const interval = setInterval(() => {
      const pos = gpsTrackingService.getCurrentPosition();
      setCurrentPosition(pos);
      setQueueSize(gpsTrackingService.getQueueSize());
    }, 1000);

    return () => clearInterval(interval);
  }, [isTracking]);

  useEffect(() => {
    if (isTracking && workOrderId) {
      gpsTrackingService.updateWorkOrder(workOrderId);
    }
  }, [workOrderId, isTracking]);

  async function checkLocationPermission() {
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        setLocationPermission(result.state);

        result.addEventListener('change', () => {
          setLocationPermission(result.state);
        });
      } catch (error) {
        console.error('Error checking location permission:', error);
      }
    }
  }

  async function handleStartTracking() {
    if (!profile) return;

    try {
      const started = await gpsTrackingService.startTracking(profile.id, dailyClockEntryId, workOrderId);
      if (started) {
        setIsTracking(true);
        setTimeout(() => {
          setCurrentPosition(gpsTrackingService.getCurrentPosition());
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to start GPS tracking:', error);
    }
  }

  function handleStopTracking() {
    gpsTrackingService.stopTracking();
    setIsTracking(false);
    setCurrentPosition(null);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className={`w-5 h-5 ${isTracking ? 'text-green-600' : 'text-gray-400'}`} />
          <h3 className="font-semibold text-gray-900">GPS Tracking</h3>
          {isTracking && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <span className="inline-block w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi className="w-4 h-4 text-green-600" />
          ) : (
            <WifiOff className="w-4 h-4 text-orange-600" />
          )}
        </div>
      </div>

      {isTracking && currentPosition && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Location:</span>
            <span className="font-mono text-xs text-gray-700">
              {currentPosition.coords.latitude.toFixed(6)}, {currentPosition.coords.longitude.toFixed(6)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Accuracy:</span>
            <span className="text-gray-900 font-medium">{Math.round(currentPosition.coords.accuracy)}m</span>
          </div>
          {currentPosition.coords.speed !== null && currentPosition.coords.speed > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Speed:</span>
              <span className="text-gray-900 font-medium">
                {Math.round(currentPosition.coords.speed * 2.237)} mph
              </span>
            </div>
          )}
          {!isOnline && queueSize > 0 && (
            <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded">
              <WifiOff className="w-4 h-4" />
              <span>{queueSize} GPS points queued for sync</span>
            </div>
          )}
        </div>
      )}

      {!isTracking ? (
        <button
          onClick={handleStartTracking}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Navigation className="w-5 h-5" />
          Start GPS Tracking
        </button>
      ) : (
        <button
          onClick={handleStopTracking}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <EyeOff className="w-5 h-5" />
          Stop Tracking
        </button>
      )}

      <div className="mt-3 flex items-start gap-2 text-xs text-gray-500">
        <Eye className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          GPS tracking is only active while you're clocked in. Your location is used for travel bonus calculations
          and route verification. We respect your privacy and only track during work hours.
        </p>
      </div>
    </div>
  );
}
