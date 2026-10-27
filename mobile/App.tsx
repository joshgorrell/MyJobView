import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LocationProvider } from './src/contexts/LocationContext';
import { OfflineProvider } from './src/contexts/OfflineContext';

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
      <StatusBar style="auto" />
      <Stack.Navigator>
        {!session ? <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} /> : <>
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="TimeClock" component={TimeClockScreen} />
          <Stack.Screen name="WorkOrders" component={WorkOrdersScreen} />
          <Stack.Screen name="WorkOrderDetail" component={WorkOrderDetailScreen} />
          <Stack.Screen name="LocationHistory" component={LocationHistoryScreen} />
          <Stack.Screen name="TimeHistory" component={TimeHistoryScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </>}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
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
