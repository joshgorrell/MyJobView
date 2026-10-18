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

interface ClockEntry {
  id: string;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  break_minutes: number;
  status: string;
  notes: string | null;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_in_gps_accuracy: number | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
}

interface BreakEntry {
  id: string;
  daily_clock_entry_id: string;
  break_start: string;
  break_end: string | null;
  break_type: string;
}

export default function TimeHistoryScreen() {
  const { profile } = useAuth();
  const { isConnected } = useOffline();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  const [breaks, setBreaks] = useState<Record<string, BreakEntry[]>>({});
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('America/Chicago');
  const [weekTotal, setWeekTotal] = useState(0);

  const loadData = useCallback(async () => {
    if (!profile) return;
    try {
      const context = await getEmployeeTimeContext(profile.id);
      setTimezone(context.timezone);

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('daily_clock_entries')
        .select('*')
        .eq('technician_id', profile.id)
        .order('clock_in', { ascending: false })
        .limit(30);

      if (error) throw error;

      const sortedData = (data || []).sort((a, b) => new Date(b.clock_in).getTime() - new Date(a.clock_in).getTime());
      setEntries(sortedData);

      const weekEntries = (data || []).filter(e => new Date(e.clock_in) >= weekAgo);
      setWeekTotal(weekEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0));

      if (sortedData.length > 0) {
        const entryIds = sortedData.slice(0, 10).map(e => e.id);
        const { data: breakData } = await supabase
          .from('daily_clock_breaks')
          .select('*')
          .in('daily_clock_entry_id', entryIds)
          .order('break_start', { ascending: true });

        const breakMap: Record<string, BreakEntry[]> = {};
        for (const brk of breakData || []) {
          if (!breakMap[brk.daily_clock_entry_id]) breakMap[brk.daily_clock_entry_id] = [];
          breakMap[brk.daily_clock_entry_id].push(brk);
        }
        setBreaks(breakMap);
      }
    } catch (error) {
      console.error('Error loading time history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  function onRefresh() {
    setRefreshing(true);
    loadData();
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function getDurationText(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary[600]} />
      </View>
    );
  }

  if (!isConnected && entries.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState title="Offline" message="Time history is not available while offline. Connect to the internet to view your clock history." />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState title="No Time History" message="Your clock history will appear here after your first shift." />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary[600]]} />}
    >
      {/* Summary Card */}
      <Card style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>This Week</Text>
        <Text style={styles.summaryValue}>{weekTotal.toFixed(2)}h</Text>
        <Text style={styles.summarySubtext}>Total hours worked</Text>
      </Card>

      {/* Time Entries */}
      <Text style={styles.sectionTitle}>RECENT SHIFTS</Text>

      {entries.map((entry) => {
        const isExpanded = expandedEntry === entry.id;
        const entryBreaks = breaks[entry.id] || [];
        const isActive = !entry.clock_out;
        const totalBreakMinutes = entryBreaks.reduce((sum, b) => {
          if (b.break_end) return sum + Math.floor((new Date(b.break_end).getTime() - new Date(b.break_start).getTime()) / 60000);
          return sum;
        }, 0);

        return (
          <View key={entry.id} style={styles.entrySection}>
            <TouchableOpacity
              style={styles.entryHeader}
              onPress={() => setExpandedEntry(isExpanded ? null : entry.id)}
              activeOpacity={0.7}
            >
              <View style={styles.entryHeaderLeft}>
                <Text style={styles.entryDate}>{formatDate(entry.clock_in)}</Text>
                <Text style={styles.entryTimeRange}>
                  {formatTime(entry.clock_in)}
                  {entry.clock_out ? ` - ${formatTime(entry.clock_out)}` : ' - Active'}
                </Text>
              </View>
              <View style={styles.entryHeaderRight}>
                <Text style={styles.entryHours}>{entry.total_hours ? entry.total_hours.toFixed(2) : '0.00'}h</Text>
                {isActive ? (
                  <Badge label="Active" variant="green" />
                ) : (
                  <Badge label="Completed" variant="gray" />
                )}
                <View style={[styles.chevron, isExpanded && styles.chevronExpanded]} />
              </View>
            </TouchableOpacity>

            {isExpanded && (
              <Card style={styles.entryDetails}>
                {totalBreakMinutes > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Break Time</Text>
                    <Text style={styles.detailValue}>{getDurationText(totalBreakMinutes)}</Text>
                  </View>
                )}
                {entry.notes && (
                  <View style={styles.notesSection}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.notesText}>{entry.notes}</Text>
                  </View>
                )}
                {entry.clock_in_latitude != null && (
                  <View style={styles.gpsSection}>
                    <Text style={styles.detailLabel}>GPS</Text>
                    <Text style={styles.gpsText}>
                      In: {entry.clock_in_latitude.toFixed(4)}, {entry.clock_in_longitude?.toFixed(4)}
                      {entry.clock_in_gps_accuracy ? ` (±${entry.clock_in_gps_accuracy.toFixed(0)}m)` : ''}
                    </Text>
                    {entry.clock_out_latitude != null && (
                      <Text style={styles.gpsText}>
                        Out: {entry.clock_out_latitude.toFixed(4)}, {entry.clock_out_longitude?.toFixed(4)}
                      </Text>
                    )}
                  </View>
                )}

                {/* Breaks list */}
                {entryBreaks.length > 0 && (
                  <View style={styles.breaksSection}>
                    <Text style={styles.detailLabel}>Break Details</Text>
                    {entryBreaks.map((brk) => (
                      <View key={brk.id} style={styles.breakDetailRow}>
                        <Text style={styles.breakType}>{brk.break_type}</Text>
                        <Text style={styles.breakTimeText}>
                          {formatTime(brk.break_start)}
                          {brk.break_end ? ` - ${formatTime(brk.break_end)}` : ' - Active'}
                        </Text>
                        {brk.break_end && (
                          <Text style={styles.breakDurationText}>
                            {getDurationText(Math.floor((new Date(brk.break_end).getTime() - new Date(brk.break_start).getTime()) / 60000))}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {!totalBreakMinutes && !entry.notes && entry.clock_in_latitude == null && (
                  <Text style={styles.noDetails}>No additional details for this shift</Text>
                )}
              </Card>
            )}
          </View>
        );
      })}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Showing last {entries.length} shifts</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[100] },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gray[100] },
  summaryCard: { marginTop: Spacing.lg, marginBottom: Spacing.lg, alignItems: 'center' },
  summaryLabel: { ...Typography.label, color: Colors.gray[400], marginBottom: Spacing.sm },
  summaryValue: { fontSize: 40, fontWeight: '700', color: Colors.primary[600], fontVariant: ['tabular-nums'] },
  summarySubtext: { ...Typography.caption, color: Colors.gray[500], marginTop: Spacing.xs },
  sectionTitle: { ...Typography.label, paddingHorizontal: Spacing.lg + 4, marginBottom: Spacing.md },
  entrySection: { marginBottom: Spacing.sm },
  entryHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.white, marginHorizontal: Spacing.lg, borderRadius: Radius.lg,
    padding: Spacing.lg + 2, ...Shadows.small,
  },
  entryHeaderLeft: { flex: 1 },
  entryDate: { ...Typography.subheading, marginBottom: 2 },
  entryTimeRange: { ...Typography.caption, color: Colors.gray[500] },
  entryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  entryHours: { fontSize: 16, fontWeight: '700', color: Colors.gray[800], fontVariant: ['tabular-nums'] },
  chevron: {
    width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: Colors.gray[400],
    transform: [{ rotate: '45deg' }, { translateY: -2 }], marginLeft: Spacing.xs,
  },
  chevronExpanded: { transform: [{ rotate: '135deg' }, { translateY: 2 }] },
  entryDetails: { marginTop: Spacing.xs, marginBottom: 0 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  detailLabel: { ...Typography.label, color: Colors.gray[400], marginBottom: Spacing.xs },
  detailValue: { ...Typography.body, fontWeight: '600', color: Colors.gray[800] },
  notesSection: { paddingVertical: Spacing.sm },
  notesText: { ...Typography.body, color: Colors.gray[700], lineHeight: 20 },
  gpsSection: { paddingVertical: Spacing.sm },
  gpsText: { ...Typography.caption, color: Colors.gray[500], lineHeight: 18, fontVariant: ['tabular-nums'] },
  breaksSection: { paddingVertical: Spacing.sm },
  breakDetailRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.xs,
    backgroundColor: Colors.gray[50], borderRadius: Radius.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.xs,
  },
  breakType: { fontSize: 13, fontWeight: '600', color: Colors.gray[700], textTransform: 'capitalize', flex: 1 },
  breakTimeText: { fontSize: 12, color: Colors.gray[500], flex: 1 },
  breakDurationText: { fontSize: 12, fontWeight: '600', color: Colors.gray[600] },
  noDetails: { ...Typography.body, color: Colors.gray[400], textAlign: 'center', paddingVertical: Spacing.lg },
  footer: { padding: Spacing.xxxl, alignItems: 'center' },
  footerText: { ...Typography.caption, color: Colors.gray[400] },
});
