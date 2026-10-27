import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { startMobileSession, recordMobileActivity } from './src/services/MobileSessionTracking';
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
  const active = useRef(AppState.currentState === 'active');
  useEffect(() => {
    if (!session?.user?.id) return;
    void startMobileSession(session.user.id).catch(error => console.warn('Mobile session registration failed:', error));
    const subscription = AppState.addEventListener('change', state => {
      active.current = state === 'active';
      if (active.current) void startMobileSession(session.user.id).then(() => recordMobileActivity('mobile_foreground')).catch(error => console.warn('Mobile session resume failed:', error));
    });
    const heartbeat = setInterval(() => {
      if (active.current) void recordMobileActivity('mobile_active');
    }, 120000);
    return () => { subscription.remove(); clearInterval(heartbeat); };
  }, [session?.user?.id]);
  if (loading) return null;
  return (
    <NavigationContainer onStateChange={state => {
      if (!session || !active.current || !state) return;
      let route: any = state.routes[state.index];
      while (route?.state?.routes) route = route.state.routes[route.state.index ?? 0];
      if (route?.name) void recordMobileActivity('mobile_' + String(route.name).replace(/[^a-zA-Z0-9_]/g, '').toLowerCase());
    }}>
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
