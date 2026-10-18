import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { Colors } from '../theme/colors';
import { Typography, Spacing, Radius, Shadows } from '../theme/styles';
import { Card, EmptyState, Badge } from '../components/UI';
import { getEmployeeTimeContext, workDate } from '../services/EmployeeTimeContext';

interface GpsPoint {
  id: string;
  daily_clock_entry_id: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  captured_at: string;
  capture_method: string;
  battery_level: number | null;
}

interface DayGroup {
  date: string;
  points: GpsPoint[];
  entryId: string | null;
}

export default function LocationHistoryScreen() {
  const { profile } = useAuth();
  const { isConnected } = useOffline();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [timeContext, setTimeContext] = useState<{ timezone: string } | null>(null);

  useEffect(() => { loadData(); }, [profile]);

  const loadData = useCallback(async () => {
    if (!profile) return;
    try {
      const context = await getEmployeeTimeContext(profile.id);
      setTimeContext(context);

      const { data, error } = await supabase
        .from('enhanced_gps_breadcrumbs')
        .select('id, daily_clock_entry_id, latitude, longitude, accuracy, captured_at, capture_method, battery_level')
        .eq('technician_id', profile.id)
        .order('captured_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const groups: Record<string, DayGroup> = {};
      for (const point of data || []) {
        const dateKey = new Date(point.captured_at).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
        if (!groups[dateKey]) groups[dateKey] = { date: dateKey, points: [], entryId: point.daily_clock_entry_id };
        groups[dateKey].points.push(point);
      }
      setDayGroups(Object.values(groups).sort((a, b) => b.date.localeCompare(a.date)));
    } catch (error) {
      console.error('Error loading location history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  function onRefresh() {
    setRefreshing(true);
    loadData();
  }

  function formatDate(dateStr: string): string {
    const [month, day, year] = dateStr.split('/');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getAccuracyVariant(accuracy: number | null): 'green' | 'amber' | 'red' {
    if (!accuracy) return 'gray' as any;
    if (accuracy <= 10) return 'green';
    if (accuracy <= 50) return 'amber';
    return 'red';
  }

  function getAccuracyLabel(accuracy: number | null): string {
    if (!accuracy) return 'No GPS';
    if (accuracy <= 10) return 'High';
    if (accuracy <= 50) return 'Medium';
    return 'Low';
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary[600]} />
      </View>
    );
  }

  if (!isConnected && dayGroups.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState title="Offline" message="Location history is not available while offline. Connect to the internet to view your GPS trail." />
      </View>
    );
  }

  if (dayGroups.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState title="No Location Data" message="Your GPS breadcrumbs will appear here after you clock in and work a shift." />
      </View>
    );
  }

  const totalPoints = dayGroups.reduce((sum, g) => sum + g.points.length, 0);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary[600]]} />}
    >
      {/* Summary Card */}
      <Card style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{dayGroups.length}</Text>
            <Text style={styles.summaryLabel}>Days Tracked</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalPoints}</Text>
            <Text style={styles.summaryLabel}>GPS Points</Text>
          </View>
        </View>
      </Card>

      {/* Day Groups */}
      {dayGroups.map((group) => {
        const isExpanded = expandedDay === group.date;
        const firstPoint = group.points[0];
        const lastPoint = group.points[group.points.length - 1];
        const avgAccuracy = group.points.reduce((sum, p) => sum + (p.accuracy || 0), 0) / group.points.length;
        const firstTime = firstPoint ? formatTime(firstPoint.captured_at) : '--';
        const lastTime = lastPoint ? formatTime(lastPoint.captured_at) : '--';

        return (
          <View key={group.date} style={styles.daySection}>
            <TouchableOpacity
              style={styles.dayHeader}
              onPress={() => setExpandedDay(isExpanded ? null : group.date)}
              activeOpacity={0.7}
            >
              <View style={styles.dayHeaderLeft}>
                <Text style={styles.dayDate}>{formatDate(group.date)}</Text>
                <Text style={styles.dayTimeRange}>{firstTime} - {lastTime}</Text>
              </View>
              <View style={styles.dayHeaderRight}>
                <Badge label={`${group.points.length} pts`} variant="blue" />
                <Badge label={getAccuracyLabel(avgAccuracy)} variant={getAccuracyVariant(avgAccuracy)} />
                <View style={[styles.chevron, isExpanded && styles.chevronExpanded]} />
              </View>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.pointsList}>
                {group.points.slice(0, 20).map((point, idx) => (
                  <View key={point.id} style={[styles.pointRow, idx < Math.min(group.points.length, 20) - 1 && styles.pointRowBorder]}>
                    <View style={styles.pointLeft}>
                      <Text style={styles.pointTime}>{formatTime(point.captured_at)}</Text>
                      <Text style={styles.pointCoords}>
                        {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                      </Text>
                    </View>
                    <View style={styles.pointRight}>
                      {point.accuracy != null && (
                        <Text style={styles.pointAccuracy}>±{point.accuracy.toFixed(0)}m</Text>
                      )}
                      <Text style={styles.pointMethod}>{point.capture_method.replace(/_/g, ' ')}</Text>
                    </View>
                  </View>
                ))}
                {group.points.length > 20 && (
                  <Text style={styles.morePoints}>+{group.points.length - 20} more points</Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Location data is retained for 90 days</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[100] },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gray[100] },
  summaryCard: { marginTop: Spacing.lg, marginBottom: Spacing.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 32, fontWeight: '700', color: Colors.primary[600] },
  summaryLabel: { ...Typography.caption, color: Colors.gray[500], marginTop: Spacing.xs, fontWeight: '600' },
  summaryDivider: { width: 1, height: 40, backgroundColor: Colors.gray[200] },
  daySection: { marginBottom: Spacing.sm },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.white, marginHorizontal: Spacing.lg, borderRadius: Radius.lg,
    padding: Spacing.lg + 2, ...Shadows.small,
  },
  dayHeaderLeft: { flex: 1 },
  dayDate: { ...Typography.subheading, marginBottom: 2 },
  dayTimeRange: { ...Typography.caption, color: Colors.gray[500] },
  dayHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chevron: {
    width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: Colors.gray[400],
    transform: [{ rotate: '45deg' }, { translateY: -2 }], marginLeft: Spacing.xs,
  },
  chevronExpanded: { transform: [{ rotate: '135deg' }, { translateY: 2 }] },
  pointsList: {
    backgroundColor: Colors.white, marginHorizontal: Spacing.lg, marginTop: Spacing.xs,
    borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.small,
  },
  pointRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md },
  pointRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray[200] },
  pointLeft: { flex: 1 },
  pointTime: { ...Typography.body, fontWeight: '600', color: Colors.gray[800], marginBottom: 2 },
  pointCoords: { ...Typography.caption, color: Colors.gray[400], fontVariant: ['tabular-nums'] },
  pointRight: { alignItems: 'flex-end' },
  pointAccuracy: { ...Typography.caption, color: Colors.gray[600], fontWeight: '600', marginBottom: 2 },
  pointMethod: { ...Typography.caption, color: Colors.gray[400], textTransform: 'capitalize' },
  morePoints: { ...Typography.caption, color: Colors.gray[400], textAlign: 'center', marginTop: Spacing.md, fontWeight: '600' },
  footer: { padding: Spacing.xxxl, alignItems: 'center' },
  footerText: { ...Typography.caption, color: Colors.gray[400] },
});
