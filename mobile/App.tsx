import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LocationProvider } from './src/contexts/LocationContext';
import { OfflineProvider } from './src/contexts/OfflineContext';
import { NotificationService } from './src/services/NotificationService';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import TimeClockScreen from './src/screens/TimeClockScreen';
import WorkOrdersScreen from './src/screens/WorkOrdersScreen';
import WorkOrderDetailScreen from './src/screens/WorkOrderDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LocationHistoryScreen from './src/screens/LocationHistoryScreen';
import TimeHistoryScreen from './src/screens/TimeHistoryScreen';

const Stack = createNativeStackNavigator();

function AppNavigation() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#f8fafc', headerTitleStyle: { fontWeight: 'bold' }, contentStyle: { backgroundColor: '#0f172a' } }}>
        {!session ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'MyJobView' }} />
            <Stack.Screen name="TimeClock" component={TimeClockScreen} options={{ title: 'Time Clock' }} />
            <Stack.Screen name="WorkOrders" component={WorkOrdersScreen} options={{ title: 'My Work Orders' }} />
            <Stack.Screen name="WorkOrderDetail" component={WorkOrderDetailScreen} options={{ title: 'Work Order Details' }} />
            <Stack.Screen name="LocationHistory" component={LocationHistoryScreen} options={{ title: 'Location History' }} />
            <Stack.Screen name="TimeHistory" component={TimeHistoryScreen} options={{ title: 'My Time History' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => { void NotificationService.initialize(); }, []);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <OfflineProvider>
          <LocationProvider>
            <AppNavigation />
          </LocationProvider>
        </OfflineProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
