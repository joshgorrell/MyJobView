import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ViewStyle,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { useLocation } from '../contexts/LocationContext';
import { Colors } from '../theme/colors';
import { Typography, Spacing, Radius, Shadows } from '../theme/styles';
import { Logo } from '../components/Logo';
import { ScreenContainer, SafeHeader } from '../components/ScreenContainer';
import { supabase } from '../services/supabase';
import { getEmployeeTimeContext, workDate } from '../services/EmployeeTimeContext';

interface RecentDay {
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  status: string;
}

export default function DashboardScreen({ navigation }: any) {
  const { profile, signOut } = useAuth();
  const { isConnected, pendingSync } = useOffline();
  const { isTracking } = useLocation();
  const [hoursToday, setHoursToday] = useState<string>('0.00');
  const [jobsToday, setJobsToday] = useState<number>(0);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [recentDays, setRecentDays] = useState<RecentDay[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadStats = useCallback(async () => {
    if (!profile) return;
    try {
      const context = await getEmployeeTimeContext(profile.id);
      const today = workDate(new Date(), context.timezone);

      const { data: todayEntry } = await supabase
        .from('daily_clock_entries')
        .select('id, clock_in, clock_out, total_hours, status, entry_date')
        .eq('technician_id', profile.id)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (todayEntry) {
        setIsClockedIn(true);
        setClockInTime(todayEntry.clock_in);
        const elapsedMs = Date.now() - new Date(todayEntry.clock_in).getTime();
        const elapsedHours = elapsedMs / (1000 * 60 * 60);
        setHoursToday(elapsedHours.toFixed(2));
      } else {
        setIsClockedIn(false);
        setClockInTime(null);
        const { data: completedToday } = await supabase
          .from('daily_clock_entries')
          .select('total_hours')
          .eq('technician_id', profile.id)
          .eq('entry_date', today)
          .not('clock_out', 'is', null)
          .maybeSingle();
        setHoursToday(completedToday ? completedToday.total_hours.toFixed(2) : '0.00');
      }

      const { count } = await supabase
        .from('time_entries')
        .select('*', { count: 'exact', head: true })
        .eq('technician_id', profile.id)
        .eq('entry_date', today)
        .not('work_order_id', 'is', null);
      setJobsToday(count || 0);

      const { data: recent } = await supabase
        .from('daily_clock_entries')
        .select('entry_date, clock_in, clock_out, total_hours, status')
        .eq('technician_id', profile.id)
        .order('clock_in', { ascending: false })
        .limit(5);
      setRecentDays(recent || []);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoadingStats(false);
    }
  }, [profile]);

  useEffect(() => {
    loadStats();
    const channel = supabase
      .channel('dashboard-clock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_clock_entries', filter: `technician_id=eq.${profile?.id}` }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries', filter: `technician_id=eq.${profile?.id}` }, loadStats)
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [profile, loadStats]);

  function getElapsedTime(): string {
    if (!clockInTime) return '0h 0m';
    const diffMs = currentTime.getTime() - new Date(clockInTime).getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  const menuItems: { title: string; screen: string; color: string; icon: string; description: string }[] = [
    { title: 'Time Clock', screen: 'TimeClock', color: Colors.primary[600], icon: 'clock', description: 'Clock in/out with GPS' },
    { title: 'My Time History', screen: 'TimeHistory', color: Colors.primary[400], icon: 'history', description: 'View past shifts' },
    { title: 'Work Orders', screen: 'WorkOrders', color: Colors.green[600], icon: 'wrench', description: 'View assigned jobs' },
    { title: 'Location History', screen: 'LocationHistory', color: Colors.amber[500], icon: 'location', description: 'GPS trail data' },
    { title: 'Settings', screen: 'Settings', color: Colors.gray[600], icon: 'settings', description: 'App preferences' },
  ];

  return (
    <ScreenContainer scroll>
      {/* Status Bar */}
      <SafeHeader style={styles.statusBar}>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, isConnected ? styles.online : styles.offline]} />
          <Text style={styles.statusText}>{isConnected ? 'Online' : 'Offline'}</Text>
        </View>
        {pendingSync > 0 && (
          <View style={styles.statusItem}>
            <Text style={styles.syncText}>{pendingSync} pending sync</Text>
          </View>
        )}
        {isTracking && (
          <View style={styles.statusItem}>
            <View style={styles.trackingDot} />
            <Text style={styles.statusText}>GPS Active</Text>
          </View>
        )}
      </SafeHeader>

      {/* Header with Logo */}
      <View style={styles.header}>
        <Logo size={56} variant="dark" />
        <View style={styles.headerText}>
          <Text style={styles.greeting}>Welcome back</Text>
          <Text style={styles.name}>{profile?.full_name || profile?.email}</Text>
          <Text style={styles.role}>{profile?.role?.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      {/* Clock Status Hero Card */}
      <TouchableOpacity
        style={styles.heroCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('TimeClock')}
      >
        <View style={styles.heroLeft}>
          <Text style={styles.heroLabel}>{isClockedIn ? 'CURRENT SHIFT' : 'CLOCK STATUS'}</Text>
          <Text style={styles.heroValue}>{isClockedIn ? getElapsedTime() : 'Not Clocked In'}</Text>
          {isClockedIn && clockInTime && (
            <Text style={styles.heroSubtext}>Started at {formatTime(clockInTime)}</Text>
          )}
        </View>
        <View style={[styles.heroButton, { backgroundColor: isClockedIn ? Colors.green[500] : Colors.primary[600] }]}>
          <Text style={styles.heroButtonText}>{isClockedIn ? 'VIEW' : 'START'}</Text>
        </View>
      </TouchableOpacity>

      {/* Quick Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{loadingStats ? '--' : hoursToday}</Text>
          <Text style={styles.statUnit}>hrs</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{loadingStats ? '--' : String(jobsToday)}</Text>
          <Text style={styles.statUnit}>jobs</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
      </View>

      {/* Recent Shifts */}
      {recentDays.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>RECENT SHIFTS</Text>
          <View style={styles.recentCard}>
            {recentDays.map((day, index) => (
              <View key={day.entry_date + index} style={[styles.recentRow, index < recentDays.length - 1 && styles.recentRowBorder]}>
                <View style={styles.recentLeft}>
                  <Text style={styles.recentDate}>{formatDate(day.clock_in)}</Text>
                  <Text style={styles.recentTime}>
                    {formatTime(day.clock_in)}{day.clock_out ? ` - ${formatTime(day.clock_out)}` : ' - Active'}
                  </Text>
                </View>
                <View style={styles.recentRight}>
                  <Text style={styles.recentHours}>{day.total_hours ? day.total_hours.toFixed(2) : '0.00'}h</Text>
                  <Text style={[styles.recentStatus, { color: day.clock_out ? Colors.gray[400] : Colors.green[600] }]}>
                    {day.clock_out ? 'Completed' : 'Active'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Navigation Menu */}
      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>MENU</Text>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={styles.menuRow}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(item.screen)}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: item.color }]}>
              <MenuIcon name={item.icon} size={22} color={Colors.white} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuDescription}>{item.description}</Text>
            </View>
            <View style={styles.menuChevron} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={signOut} activeOpacity={0.7}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>MyJobView</Text>
        <Text style={styles.footerSubtext}>Version 1.0.0</Text>
      </View>
    </ScreenContainer>
  );
}

function MenuIcon({ name, size, color }: { name: string; size: number; color: string }) {
  const iconStyle: ViewStyle = { width: size, height: size };
  switch (name) {
    case 'clock':
      return (
        <View style={[iconStyle, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color }} />
          <View style={{ position: 'absolute', width: 2, height: size / 2 - 4, backgroundColor: color, top: 3, left: size / 2 - 1 }} />
          <View style={{ position: 'absolute', width: size / 3, height: 2, backgroundColor: color, top: size / 2 - 1, left: size / 2 - 1 }} />
        </View>
      );
    case 'history':
      return (
        <View style={[iconStyle, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color }} />
          <View style={{ position: 'absolute', width: 2, height: size / 3, backgroundColor: color, top: 3, left: size / 2 - 1 }} />
          <View style={{ position: 'absolute', width: size / 3, height: 2, backgroundColor: color, top: size / 2, left: size / 2 - 4 }} />
        </View>
      );
    case 'wrench':
      return (
        <View style={[iconStyle, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ width: size - 4, height: 3, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-45deg' }] }} />
        </View>
      );
    case 'location':
      return (
        <View style={[iconStyle, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ width: size - 6, height: size - 6, borderRadius: (size - 6) / 2, borderWidth: 2, borderColor: color }} />
          <View style={{ width: 3, height: 6, backgroundColor: color, marginTop: -1 }} />
        </View>
      );
    case 'settings':
      return (
        <View style={[iconStyle, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2, borderWidth: 2, borderColor: color }} />
          <View style={{ position: 'absolute', width: size / 3, height: size / 3, borderRadius: size / 6, borderWidth: 2, borderColor: color }} />
        </View>
      );
    default:
      return <View style={iconStyle} />;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[100] },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  online: { backgroundColor: Colors.green[500] },
  offline: { backgroundColor: Colors.red[500] },
  trackingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary[500] },
  statusText: { ...Typography.caption, color: Colors.gray[500] },
  syncText: { ...Typography.caption, color: Colors.amber[600], fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.xxl,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
    gap: Spacing.lg,
  },
  headerText: { flex: 1 },
  greeting: { ...Typography.body, color: Colors.gray[500], marginBottom: 2 },
  name: { ...Typography.heading, marginBottom: 2 },
  role: { ...Typography.caption, color: Colors.primary[600], fontWeight: '600', textTransform: 'capitalize' as const, letterSpacing: 0 },
  heroCard: {
    margin: Spacing.lg,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    ...Shadows.medium,
  },
  heroLeft: { flex: 1 },
  heroLabel: { ...Typography.label, marginBottom: Spacing.sm, color: Colors.gray[400] },
  heroValue: { fontSize: 32, fontWeight: '700', color: Colors.gray[900], marginBottom: Spacing.xs },
  heroSubtext: { ...Typography.body, color: Colors.gray[500] },
  heroButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.md,
  },
  heroButtonText: { color: Colors.white, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  statsContainer: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.lg, marginBottom: Spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadows.small,
  },
  statValue: { fontSize: 28, fontWeight: '700', color: Colors.gray[900] },
  statUnit: { ...Typography.caption, color: Colors.gray[400], marginTop: 2 },
  statLabel: { ...Typography.caption, color: Colors.gray[500], marginTop: Spacing.sm, fontWeight: '600' },
  recentSection: { marginBottom: Spacing.xxl },
  sectionTitle: {
    ...Typography.label,
    paddingHorizontal: Spacing.lg + 4,
    marginBottom: Spacing.md,
  },
  recentCard: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Shadows.small,
  },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md },
  recentRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray[200] },
  recentLeft: { flex: 1 },
  recentDate: { ...Typography.subheading, marginBottom: 2 },
  recentTime: { ...Typography.caption, color: Colors.gray[500] },
  recentRight: { alignItems: 'flex-end' },
  recentHours: { fontSize: 16, fontWeight: '700', color: Colors.gray[800], marginBottom: 2 },
  recentStatus: { ...Typography.caption, fontWeight: '600' },
  menuSection: { marginBottom: Spacing.xxl },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    ...Shadows.small,
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.lg,
  },
  menuTextContainer: { flex: 1 },
  menuTitle: { ...Typography.subheading, marginBottom: 2 },
  menuDescription: { ...Typography.caption, color: Colors.gray[400] },
  menuChevron: {
    width: 8,
    height: 8,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: Colors.gray[300],
    transform: [{ rotate: '45deg' }],
  },
  signOutButton: {
    margin: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    ...Shadows.small,
  },
  signOutText: { color: Colors.red[500], fontSize: 16, fontWeight: '600' },
  footer: { padding: Spacing.xxxl, alignItems: 'center' },
  footerText: { ...Typography.body, fontWeight: '600', color: Colors.gray[500], marginBottom: 4 },
  footerSubtext: { ...Typography.caption, color: Colors.gray[400] },
});
