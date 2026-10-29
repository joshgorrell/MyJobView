import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { Colors } from '../theme/colors';
import { Spacing, Radius } from '../theme/styles';
import { Card, EmptyState, Badge } from '../components/UI';
import { ScreenContainer } from '../components/ScreenContainer';

type Activity = {
  id: string; clock_in: string; clock_out: string | null; total_hours: number | null;
  entry_type: string | null; work_order_id: string | null; internal_session_id: string | null;
  status: string; notes: string | null; session_type?: 'shop_time' | 'training' | null;
};
const duration = (entry: Activity, now: number) =>
  Math.max(0, (Date.parse(entry.clock_out || new Date(now).toISOString()) - Date.parse(entry.clock_in)) / 3600000);
const displayTime = (stamp: string) => new Date(stamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function JobTimeHistory() {
  const { profile } = useAuth();
  const { isConnected } = useOffline();
  const [entries, setEntries] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const load = useCallback(async () => {
    if (!profile) { setLoading(false); return; }
    try {
      const { data, error: queryError } = await supabase.from('time_entries')
        .select('id,clock_in,clock_out,total_hours,entry_type,work_order_id,internal_session_id,status,notes')
        .eq('technician_id', profile.id).order('clock_in', { ascending: false }).limit(50);
      if (queryError) throw queryError;
      const activityRows: Activity[] = data || [];
      const sessionIds = Array.from(new Set(activityRows.map(row => row.internal_session_id).filter((id): id is string => !!id)));
      if (sessionIds.length) {
        const { data: sessions, error: sessionsError } = await supabase.from('internal_time_sessions')
          .select('id,session_type').in('id', sessionIds).eq('assigned_to', profile.id);
        if (sessionsError) throw sessionsError;
        const types = new Map((sessions || []).map(session => [session.id, session.session_type]));
        activityRows.forEach(row => { if (row.internal_session_id) row.session_type = types.get(row.internal_session_id) || null; });
      }
      setEntries(activityRows);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Unable to load job time history.');
    } finally { setLoading(false); }
  }, [profile?.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  const weekStart = Date.now() - 7 * 24 * 3600000;
  const weekHours = entries.reduce((sum, entry) => {
    if (Date.parse(entry.clock_in) < weekStart) return sum;
    return sum + (entry.clock_out ? Number(entry.total_hours ?? duration(entry, now)) : duration(entry, now));
  }, 0);
  if (loading) return <ScreenContainer center><ActivityIndicator size="large" color={Colors.primary[600]} /></ScreenContainer>;
  if (!isConnected && !entries.length) return <ScreenContainer><EmptyState title="Offline" message="Connect to view your job time history." /></ScreenContainer>;
  return <ScreenContainer scroll>
    <Card style={styles.summary}>
      <Text style={styles.eyebrow}>LAST 7 DAYS</Text>
      <Text style={styles.total}>{weekHours.toFixed(2)}h</Text>
      <Text style={styles.muted}>Recorded activity time · subject to manager approval</Text>
    </Card>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <TouchableOpacity accessibilityRole="button" onPress={() => { void load(); }} style={styles.refresh}><Text style={styles.refreshText}>Refresh history</Text></TouchableOpacity>
      <Text style={styles.heading}>RECENT JOB, SHOP & TRAINING TIME</Text>
      {entries.length === 0 && !error && <EmptyState title="No Activity Yet" message="Your recorded Job Time, Shop Time, and Training will appear here." />}
      {entries.map(entry => {
        const type = entry.internal_session_id ? (entry.session_type === 'training' ? 'Training' : entry.session_type === 'shop_time' ? 'Shop Time' : 'Internal Time') : entry.work_order_id ? 'Work Order' : entry.entry_type === 'project' ? 'Project Time' : 'Customer / Job Activity';
        const hours = entry.clock_out ? Number(entry.total_hours ?? duration(entry, now)) : duration(entry, now);
        return <View key={entry.id} style={styles.row}>
          <View style={styles.top}><Text style={styles.label}>{type}</Text><Badge label={entry.clock_out ? entry.status || 'Submitted' : 'Active'} variant={entry.clock_out ? 'gray' : 'green'} /></View>
          <Text style={styles.muted}>{new Date(entry.clock_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {displayTime(entry.clock_in)} – {entry.clock_out ? displayTime(entry.clock_out) : 'Running'}</Text>
          <Text style={styles.hours}>{hours.toFixed(2)}h</Text>
          {!!entry.notes && <Text style={styles.notes}>{entry.notes}</Text>}
        </View>;
      })}

  </ScreenContainer>;
}
const styles = StyleSheet.create({
  summary: { marginTop: Spacing.lg, marginBottom: Spacing.lg, alignItems: 'center' },
  eyebrow: { color: Colors.gray[500], fontSize: 12, fontWeight: '700' },
  total: { color: Colors.primary[600], fontSize: 38, fontWeight: '700', marginTop: 4 },
  muted: { color: Colors.gray[500], fontSize: 13, marginTop: 4 },
  heading: { color: Colors.gray[600], fontSize: 12, fontWeight: '700', marginBottom: Spacing.md },
  row: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: Colors.gray[800], fontSize: 16, fontWeight: '700' },
  hours: { color: Colors.gray[800], fontSize: 18, fontWeight: '700', marginTop: Spacing.sm },
  notes: { color: Colors.gray[600], marginTop: Spacing.sm },
  error: { color: Colors.red[600], marginBottom: Spacing.md },
  refresh: { alignSelf: 'flex-end', marginBottom: Spacing.md, padding: Spacing.sm },
  refreshText: { color: Colors.primary[600], fontWeight: '700' },
});