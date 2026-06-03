import React, { createContext, useContext, useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { locationTrackingService } from '../services/LocationTrackingService';

interface LocationContextType {
  currentLocation: Location.LocationObject | null;
  isTracking: boolean;
  locationPermission: string;
  requestPermissions: () => Promise<boolean>;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [locationPermission, setLocationPermission] = useState('undetermined');

  useEffect(() => {
    checkPermissions();

    const interval = setInterval(() => {
      const location = locationTrackingService.getCurrentLocation();
      setCurrentLocation(location);
      setIsTracking(locationTrackingService.isCurrentlyTracking());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  async function checkPermissions() {
    const { status } = await Location.getForegroundPermissionsAsync();
    setLocationPermission(status);
  }

  async function requestPermissions(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setLocationPermission(status);
    return status === 'granted';
  }

  return (
    <LocationContext.Provider
      value={{
        currentLocation,
        isTracking,
        locationPermission,
        requestPermissions,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within LocationProvider');
  }
  return context;
}
