import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { ScreenContainer } from '../components/ScreenContainer';
import { Colors } from '../theme/colors';
import { supabase } from '../services/supabase';
import { getEmployeeTimeContext, workDate } from '../services/EmployeeTimeContext';

type Mode = 'day' | 'week' | 'month' | 'agenda';
type PrivateAppointment = { id: string; appointment_date: string; start_time: string | null; end_time: string | null; title: string | null; status: string; assigned_technician: string | null; can_view_details: boolean | null };
type TeamLeaveDay = { request_id: string; employee_id: string; leave_date: string; full_day: boolean; start_time: string | null; end_time: string | null };
type Event = { id: string; date: string; start: string | null; end: string | null; title: string; subtitle: string; kind: 'job' | 'appointment' | 'internal' | 'time_off'; workOrderId?: string };
const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)), 12);
const shift = (d: Date, days: number) => { const next = new Date(d); next.setDate(next.getDate() + days); return next; };
const weekStart = (d: Date) => shift(d, -d.getDay());
const formatClock = (s: string | null) => {
  if (!s) return 'All day';
  const [h, m] = s.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return s;
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
};

export default function CalendarScreen({ navigation }: any) {
  const { profile } = useAuth();
  const { isConnected } = useOffline();
  const [mode, setMode] = useState<Mode>('week');
  const [selected, setSelected] = useState(key(new Date()));
  const [timezone, setTimezone] = useState('America/Chicago');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadedRange, setLoadedRange] = useState('');
  const requestId = useRef(0);
  const activeRef = useRef(true);
  const date = fromKey(selected);
  const first = mode === 'month' ? weekStart(new Date(date.getFullYear(), date.getMonth(), 1, 12)) : mode === 'week' ? weekStart(date) : date;
  const last = mode === 'month' ? shift(first, Math.ceil((new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate() + new Date(date.getFullYear(), date.getMonth(), 1, 12).getDay()) / 7) * 7 - 1) : mode === 'week' ? shift(first, 6) : mode === 'agenda' ? shift(date, 29) : date;
  const rangeStart = key(first), rangeEnd = key(last);

  useEffect(() => {
    if (!profile?.id) return;
    let active = true;
    getEmployeeTimeContext(profile.id).then(ctx => {
      if (!active) return;
      setTimezone(ctx.timezone);
      setSelected(workDate(new Date(), ctx.timezone));
    }).catch(() => { /* Retain a stable default until policy is available. */ });
    return () => { active = false; };
  }, [profile?.id]);

  const load = useCallback(async () => {
    if (!profile?.id || !isConnected) { setRefreshing(false); return; }
    const request = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const [jobs, appointments, internal, timeOff] = await Promise.all([
        supabase.from('work_orders')
          .select('id, work_order_number, title, customer_name, scheduled_date, scheduled_start_time, scheduled_end_time, status')
          .eq('assigned_to', profile.id).gte('scheduled_date', rangeStart).lte('scheduled_date', rangeEnd).limit(300),
        // Match the web calendar's privacy-aware appointment access path.
        // The RPC controls whether details may be exposed to this employee.
        supabase.rpc('get_appointments_with_privacy', {
          p_user_id: profile.id,
          p_company_id: profile.organization_id || profile.id,
          p_start_date: rangeStart,
          p_end_date: rangeEnd,
        }),
        supabase.from('internal_time_sessions')
          .select('id, title, session_date, start_time, end_time, status')
          .eq('assigned_to', profile.id).in('status', ['scheduled', 'in_progress', 'completed'])
          .gte('session_date', rangeStart).lte('session_date', rangeEnd).limit(300),
        supabase.rpc('team_time_off', { p_from: rangeStart, p_to: rangeEnd }),
      ]);
      if (jobs.error) throw jobs.error;
      if (appointments.error) throw appointments.error;
      if (internal.error) throw internal.error;
      if (timeOff.error) throw timeOff.error;
      const result: Event[] = [
        ...(jobs.data || []).filter(j => j.status !== 'cancelled').map(j => ({
          id: `job-${j.id}`, date: j.scheduled_date, start: j.scheduled_start_time, end: j.scheduled_end_time,
          title: j.title || j.work_order_number || 'Work order', subtitle: j.customer_name || j.work_order_number || 'Work order',
          kind: 'job' as const, workOrderId: j.id,
        })),
        ...(appointments.data || [])
          .filter((a: PrivateAppointment) => a.status !== 'cancelled' && a.assigned_technician === profile.id)
          .map((a: PrivateAppointment) => ({
            id: `appointment-${a.id}`, date: a.appointment_date, start: a.start_time, end: a.end_time,
            title: a.can_view_details === false ? 'Busy' : (a.title || 'Appointment'),
            subtitle: a.can_view_details === false ? 'Private appointment' : 'Appointment',
            kind: 'appointment' as const,
          })),
        ...(internal.data || []).map(item => ({
          id: `internal-${item.id}`, date: item.session_date, start: item.start_time, end: item.end_time,
          title: item.title || 'Internal session', subtitle: 'Internal time', kind: 'internal' as const,
        })),
        ...(timeOff.data || []).filter((item: TeamLeaveDay) => item.employee_id === profile.id).map((item: TeamLeaveDay) => ({
          id: `leave-${item.request_id}-${item.leave_date}`, date: item.leave_date,
          start: item.full_day ? null : item.start_time, end: item.full_day ? null : item.end_time,
          title: item.full_day ? 'Approved time off' : 'Approved time off (partial day)',
          subtitle: 'Time off', kind: 'time_off' as const,
        })),
      ];
      if (!activeRef.current || request !== requestId.current) return;
      setEvents(result.sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '')));
      setHasLoaded(true);
      setLoadedRange(rangeStart + ':' + rangeEnd);
    } catch (e) {
      console.error('Calendar load failed', e);
      if (!activeRef.current || request !== requestId.current) return;
      setError('Could not load your schedule. Pull down to retry.');
    } finally {
      if (activeRef.current && request === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [profile?.id, isConnected, rangeStart, rangeEnd]);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; requestId.current += 1; };
  }, []);

  // Refresh when returning to the calendar tab.
  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]));

  // Recheck PTO and internal sessions after returning from background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);
  useEffect(() => {
    if (!profile?.id || !isConnected) return;
    const channel = supabase.channel('native-calendar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `assigned_to=eq.${profile.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `assigned_technician=eq.${profile.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_time_sessions', filter: `assigned_to=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [profile?.id, isConnected, load]);

  const visibleDays = useMemo(() => {
    if (mode === 'day' || mode === 'agenda') return [date];
    const start = mode === 'week' ? weekStart(date) : weekStart(new Date(date.getFullYear(), date.getMonth(), 1, 12));
    const count = mode === 'week' ? 7 : Math.ceil((new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate() + new Date(date.getFullYear(), date.getMonth(), 1, 12).getDay()) / 7) * 7;
    return Array.from({ length: count }, (_, i) => shift(start, i));
  }, [selected, mode]);
  const selectedEvents = loadedRange === rangeStart + ':' + rangeEnd ? (mode === 'agenda' ? events : events.filter(e => e.date === selected)) : [];
  const eventDates = new Set(events.map(e => e.date));
  const move = (direction: number) => {
    if (mode === 'day') setSelected(key(shift(date, direction)));
    else if (mode === 'agenda') setSelected(key(shift(date, 30 * direction)));
    else if (mode === 'week') setSelected(key(shift(date, 7 * direction)));
    else setSelected(key(new Date(date.getFullYear(), date.getMonth() + direction, Math.min(date.getDate(), 28), 12)));
  };

  return (
    <ScreenContainer>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <View style={styles.header}>
          <Text style={styles.title}>My Calendar</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => setSelected(workDate(new Date(), timezone))} style={styles.today}><Text style={styles.todayText}>Today</Text></TouchableOpacity>
        </View>
        <View style={styles.modeRow}>
          {(['day', 'week', 'month', 'agenda'] as Mode[]).map(value =>
            <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }}
              style={[styles.mode, mode === value && styles.modeActive]} onPress={() => setMode(value)}>
              <Text style={[styles.modeText, mode === value && styles.modeTextActive]}>{value[0].toUpperCase() + value.slice(1)}</Text>
            </TouchableOpacity>)}
        </View>
        <View style={styles.period}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous period" style={styles.arrow} onPress={() => move(-1)}><Text style={styles.arrowText}>‹</Text></TouchableOpacity>
          <Text style={styles.periodText}>{date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next period" style={styles.arrow} onPress={() => move(1)}><Text style={styles.arrowText}>›</Text></TouchableOpacity>
        </View>
        {mode !== 'day' && mode !== 'agenda' && <View style={styles.grid}>
          {['S','M','T','W','T','F','S'].map((name, i) => <Text key={i} style={styles.weekday}>{name}</Text>)}
          {visibleDays.map(day => {
            const dateKey = key(day), chosen = dateKey === selected;
            return <TouchableOpacity key={dateKey} accessibilityRole="button"
              accessibilityLabel={day.toDateString() + (eventDates.has(dateKey) ? ', scheduled events' : '')}
              accessibilityState={{ selected: chosen }}
              onPress={() => setSelected(dateKey)} style={[styles.day, chosen && styles.dayActive]}>
              <Text style={[styles.dayText, day.getMonth() !== date.getMonth() && mode === 'month' && styles.muted, chosen && styles.dayTextActive]}>{day.getDate()}</Text>
              {eventDates.has(dateKey) && <View style={[styles.dot, chosen && styles.dotActive]} />}
            </TouchableOpacity>;
          })}
        </View>}
        <Text style={styles.dayHeading}>{mode === 'agenda' ? 'Upcoming 30 days' : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        {!isConnected && <Text style={styles.notice}>{hasLoaded && loadedRange === rangeStart + ':' + rangeEnd ? 'Offline — showing the last schedule loaded in this session.' : 'Offline — calendar data is unavailable for this period.'}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {loading && <ActivityIndicator color={Colors.primary[600]} />}
        {!loading && !error && (isConnected || (hasLoaded && loadedRange === rangeStart + ':' + rangeEnd)) && selectedEvents.length === 0 && <Text style={styles.empty}>Nothing scheduled for this period.</Text>}
        {selectedEvents.map(event =>
          <TouchableOpacity key={event.id} accessibilityRole="button"
            disabled={!event.workOrderId}
            onPress={() => event.workOrderId && navigation.navigate('WorkOrderDetail', { workOrderId: event.workOrderId })}
            style={styles.event}>
            <View style={[styles.eventStripe, { backgroundColor: event.kind === 'job' ? Colors.primary[600] : event.kind === 'appointment' ? '#8b5cf6' : event.kind === 'time_off' ? Colors.gray[400] : Colors.amber[500] }]} />
            <View style={styles.eventContent}>
              <Text style={styles.eventTime}>{mode === 'agenda' ? fromKey(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' : ''}{formatClock(event.start)}{event.end ? ` – ${formatClock(event.end)}` : ''}</Text>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventSubtitle}>{event.subtitle}</Text>
            </View>
          </TouchableOpacity>)}
        <Text style={styles.note}>Read-only schedule · Jobs, appointments, internal time and approved leave</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 32, maxWidth: 800, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 23, fontWeight: '700', color: Colors.gray[900] },
  today: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 9, backgroundColor: Colors.primary[50] },
  todayText: { color: Colors.primary[700], fontWeight: '700' },
  modeRow: { flexDirection: 'row', backgroundColor: Colors.gray[200], borderRadius: 10, padding: 3, marginBottom: 12 },
  mode: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 8 },
  modeActive: { backgroundColor: Colors.white },
  modeText: { fontWeight: '600', color: Colors.gray[600] },
  modeTextActive: { color: Colors.primary[700] },
  period: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  periodText: { fontSize: 17, fontWeight: '700', color: Colors.gray[900] },
  arrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 30, color: Colors.primary[700] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 8, marginBottom: 16 },
  weekday: { width: '14.2857%', textAlign: 'center', fontWeight: '700', color: Colors.gray[500], paddingVertical: 8 },
  day: { width: '14.2857%', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  dayActive: { backgroundColor: Colors.primary[600] },
  dayText: { fontSize: 15, fontWeight: '600', color: Colors.gray[900] },
  dayTextActive: { color: Colors.white },
  muted: { color: Colors.gray[400] },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3, backgroundColor: Colors.primary[600] },
  dotActive: { backgroundColor: Colors.white },
  dayHeading: { fontSize: 16, fontWeight: '700', color: Colors.gray[900], marginBottom: 10 },
  notice: { color: Colors.amber[700], padding: 10, backgroundColor: Colors.amber[50], marginBottom: 10 },
  error: { color: Colors.red[600], marginBottom: 10 },
  empty: { color: Colors.gray[500], paddingVertical: 20, textAlign: 'center' },
  event: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 10, marginBottom: 8, overflow: 'hidden', minHeight: 66 },
  eventStripe: { width: 4 },
  eventContent: { flex: 1, padding: 12 },
  eventTime: { fontSize: 12, fontWeight: '700', color: Colors.primary[700], marginBottom: 3 },
  eventTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray[900] },
  eventSubtitle: { fontSize: 12, color: Colors.gray[500], marginTop: 3 },
  note: { textAlign: 'center', color: Colors.gray[500], fontSize: 12, marginTop: 16 },
});
