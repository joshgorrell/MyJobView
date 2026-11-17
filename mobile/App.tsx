import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from './src/theme/colors';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LocationProvider } from './src/contexts/LocationContext';
import { OfflineProvider } from './src/contexts/OfflineContext';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import TimeClockScreen from './src/screens/TimeClockScreen';
import WorkOrdersScreen from './src/screens/WorkOrdersScreen';
import WorkOrderDetailScreen from './src/screens/WorkOrderDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LocationHistoryScreen from './src/screens/LocationHistoryScreen';
import TimeHistoryScreen from './src/screens/TimeHistoryScreen';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef<any>();
const tabs = [
  { label: 'Home', route: 'Dashboard', glyph: '⌂' },
  { label: 'Calendar', route: 'Calendar', glyph: '▦' },
  { label: 'Time', route: 'TimeClock', glyph: '◷' },
  { label: 'Jobs', route: 'WorkOrders', glyph: '▤' },
  { label: 'More', route: 'Settings', glyph: '•••' },
] as const;

function MobileTabBar({ activeRoute }: { activeRoute: string }) {
  const insets = useSafeAreaInsets();
  const selectedRoute = activeRoute === 'WorkOrderDetail' ? 'WorkOrders'
    : activeRoute === 'TimeHistory' ? 'TimeClock'
    : activeRoute === 'LocationHistory' ? 'Settings'
    : activeRoute;
  return (
    <View style={[tabStyles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map(tab => {
        const selected = selectedRoute === tab.route;
        return (
          <TouchableOpacity key={tab.route} accessibilityRole="tab"
            accessibilityLabel={tab.label} accessibilityState={{ selected }}
            onPress={() => {
              if (!navigationRef.isReady() || selected) return;
              navigationRef.navigate(tab.route);
            }}
            style={tabStyles.item} activeOpacity={0.75}>
            <Text style={[tabStyles.glyph, selected && tabStyles.active]}>{tab.glyph}</Text>
            <Text style={[tabStyles.label, selected && tabStyles.active]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: Colors.white, borderTopColor: Colors.gray[200], borderTopWidth: 1, paddingTop: 5 },
  item: { flex: 1, minHeight: 49, justifyContent: 'center', alignItems: 'center', gap: 2 },
  glyph: { fontSize: 23, fontWeight: '600', color: Colors.gray[500], height: 27 },
  label: { fontSize: 11, fontWeight: '600', color: Colors.gray[500] },
  active: { color: Colors.primary[700] },
});


function AppNavigation() {
  const { session, loading } = useAuth();
  const [activeRoute, setActiveRoute] = useState('Dashboard');
  if (loading) return null;
  return (
    <NavigationContainer ref={navigationRef} onReady={() => setActiveRoute(navigationRef.getCurrentRoute()?.name || 'Dashboard')}
      onStateChange={() => setActiveRoute(navigationRef.getCurrentRoute()?.name || 'Dashboard')}>
      <StatusBar style="auto" />
      <View style={{ flex: 1 }}>
      <Stack.Navigator>
        {!session ? <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} /> : <>
          <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Calendar" component={CalendarScreen}  options={{ headerShown: false }} />
          <Stack.Screen name="TimeClock" component={TimeClockScreen} options={{ headerShown: false }} />
          <Stack.Screen name="WorkOrders" component={WorkOrdersScreen} options={{ headerShown: false }} />
          <Stack.Screen name="WorkOrderDetail" component={WorkOrderDetailScreen} />
          <Stack.Screen name="LocationHistory" component={LocationHistoryScreen} />
          <Stack.Screen name="TimeHistory" component={TimeHistoryScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
        </>}
      </Stack.Navigator>
      {session && <MobileTabBar activeRoute={activeRoute} />}
      </View>
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
