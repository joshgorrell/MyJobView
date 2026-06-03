import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { initializeLocationTracking } from './src/services/LocationTrackingService';
import { AuthProvider } from './src/contexts/AuthContext';
import { LocationProvider } from './src/contexts/LocationContext';
import { OfflineProvider } from './src/contexts/OfflineContext';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import TimeClockScreen from './src/screens/TimeClockScreen';
import WorkOrdersScreen from './src/screens/WorkOrdersScreen';
import WorkOrderDetailScreen from './src/screens/WorkOrderDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LocationHistoryScreen from './src/screens/LocationHistoryScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Check for existing session
        const session = await SecureStore.getItemAsync('session');
        if (session) {
          setIsAuthenticated(true);
          // Initialize location tracking in background
          await initializeLocationTracking();
        }
      } catch (error) {
        console.error('Error preparing app:', error);
      } finally {
        setIsReady(true);
      }
    }

    prepare();
  }, []);

  if (!isReady) {
    return null; // Or loading screen
  }

  return (
    <AuthProvider>
      <OfflineProvider>
        <LocationProvider>
          <NavigationContainer>
            <StatusBar style="auto" />
            <Stack.Navigator
              screenOptions={{
                headerStyle: {
                  backgroundColor: '#2563eb',
                },
                headerTintColor: '#fff',
                headerTitleStyle: {
                  fontWeight: 'bold',
                },
              }}
            >
              {!isAuthenticated ? (
                <Stack.Screen
                  name="Login"
                  component={LoginScreen}
                  options={{ headerShown: false }}
                />
              ) : (
                <>
                  <Stack.Screen
                    name="Dashboard"
                    component={DashboardScreen}
                    options={{ title: 'Field Ops Pro' }}
                  />
                  <Stack.Screen
                    name="TimeClock"
                    component={TimeClockScreen}
                    options={{ title: 'Time Clock' }}
                  />
                  <Stack.Screen
                    name="WorkOrders"
                    component={WorkOrdersScreen}
                    options={{ title: 'My Work Orders' }}
                  />
                  <Stack.Screen
                    name="WorkOrderDetail"
                    component={WorkOrderDetailScreen}
                    options={{ title: 'Work Order Details' }}
                  />
                  <Stack.Screen
                    name="LocationHistory"
                    component={LocationHistoryScreen}
                    options={{ title: 'Location History' }}
                  />
                  <Stack.Screen
                    name="Settings"
                    component={SettingsScreen}
                    options={{ title: 'Settings' }}
                  />
                </>
              )}
            </Stack.Navigator>
          </NavigationContainer>
        </LocationProvider>
      </OfflineProvider>
    </AuthProvider>
  );
}
