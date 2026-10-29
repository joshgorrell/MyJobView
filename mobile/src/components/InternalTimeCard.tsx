import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { supabase } from '../services/supabase';
import {
  loadInternalTime, startNewInternalTime, startInternalTime, stopInternalTime,
  type InternalTimeType, type InternalSession, type ActivityEntry,
} from '../services/InternalTime';
import { Colors } from '../theme/colors';
import { Spacing, Radius, Typography } from '../theme/styles';
import { Card } from './UI';

type InternalTimeData = Awaited<ReturnType<typeof loadInternalTime>>;
const label = (type: InternalTimeType) => type === 'shop_time' ? 'Shop Time' : 'Training';
function elapsed(clockIn: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(clockIn)) / 1000));
  return Math.floor(seconds / 3600) + ':' + String(Math.floor(seconds % 3600 / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

export function InternalTimeCard() {
  const { profile } = useAuth();
  const { isConnected } = useOffline();
  const [data, setData] = useState<InternalTimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const generation = useRef(0);
  const [now, setNow] = useState(Date.now());
  const [requestType, setRequestType] = useState<InternalTimeType | null>(null);
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const version = ++generation.current;
    if (!profile?.organization_id) { setLoading(false); return; }
    try {
      const result = await loadInternalTime(profile);
      if (version !== generation.current) return;
      setData(result);
      setError('');
    } catch (e: any) {
      if (version === generation.current) setError(e.message || 'Unable to load Shop Time and Training.');
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [profile?.id, profile?.organization_id]);

  useFocusEffect(useCallback(() => {
    void refresh();
    const interval = setInterval(() => { if (isConnected && !saving.current) void refresh(); }, 30000);
    const state = AppState.addEventListener('change', value => { if (value === 'active') void refresh(); });
    return () => { clearInterval(interval); state.remove(); generation.current++; };
  }, [refresh, isConnected]));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel('native-internal-time-' + profile.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_time_sessions', filter: 'assigned_to=eq.' + profile.id }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries', filter: 'technician_id=eq.' + profile.id }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, profile?.id]);

  async function perform(action: () => Promise<unknown>, success?: () => void) {
    if (saving.current) return;
    if (!isConnected) { Alert.alert('Connection needed', 'Reconnect before recording Shop Time or Training.'); return; }
    saving.current = true;
    setBusy(true);
    try {
      await action();
      success?.();
    } catch (e: any) {
      Alert.alert('Unable to save', e.message || 'Refresh and try again.');
    } finally {
      await refresh();
      saving.current = false;
      setBusy(false);
    }
  }
  function openRequest(type: InternalTimeType) {
    setRequestType(type);
    setReason('');
    setRequestId(Crypto.randomUUID());
  }
  if (!profile?.organization_id) return null;
  const disabled = busy || !isConnected || loading;
  const noNewStarts = disabled || !!error || !!data?.active;
  const activeInternal = data?.active?.internal_session_id;
  function button(title: string, onPress: () => void, isDisabled = disabled, stop = false) {
    return (
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} disabled={isDisabled}
        style={[styles.button, stop && styles.stop, isDisabled && styles.disabled]} onPress={onPress}>
        <Text style={styles.buttonText}>{title}</Text>
      </TouchableOpacity>
    );
  }
  function sessionRow(session: InternalSession) {
    const entry: ActivityEntry | undefined = data?.entries.find(e => e.internal_session_id === session.id);
    const running = !!entry && !entry.clock_out;
    const needsFinish = !!entry?.clock_out && session.status !== 'completed';
    const approved = !!session.approved_by && !!session.approved_at && ['scheduled', 'in_progress'].includes(session.status);
    const status = running ? 'In progress' : needsFinish ? 'Time saved — finish submitting'
      : session.status === 'pending_approval' ? 'Awaiting manager approval'
      : session.status === 'denied' ? 'Request declined'
      : session.status === 'completed' ? (entry?.status === 'approved' ? 'Approved' : 'Submitted for review')
      : approved ? 'Ready to start' : 'Manager approval needed';
    return (
      <View key={session.id} style={styles.session}>
        <Text style={styles.sessionType}>{label(session.session_type)}</Text>
        <Text style={styles.sessionTitle}>{session.title}</Text>
        {!!session.description && <Text style={styles.body}>{session.description}</Text>}
        <Text style={styles.status}>{status}</Text>
        {session.status === 'denied' && !!session.denial_reason && <Text style={styles.body}>{session.denial_reason}</Text>}
        {running && <Text accessibilityLiveRegion="none" style={styles.elapsed}>{elapsed(entry!.clock_in, now)}</Text>}
        {entry?.clock_out && <Text style={styles.body}>{Number(entry.total_hours || 0).toFixed(2)} hours recorded</Text>}
        {approved && !entry && session.predetermined_hours != null && (
          <Text style={styles.body}>Approved block: {Number(session.predetermined_hours)} hours. The timer records actual time.</Text>
        )}
        {running && (
          <TextInput accessibilityLabel="Session notes" placeholder="Notes about the work (optional)" multiline
            editable={!busy} value={notes[session.id] || ''} onChangeText={value => setNotes(previous => ({ ...previous, [session.id]: value }))}
            style={styles.input} />
        )}
        {(running || needsFinish) && button(needsFinish ? 'Finish submitting' : 'Stop ' + label(session.session_type),
          () => { void perform(() => stopInternalTime(profile!, session.id, notes[session.id] || '')); }, disabled, true)}
        {approved && !entry && button('Start ' + label(session.session_type),
          () => { void perform(() => startInternalTime(profile!, session.id)); }, noNewStarts)}
      </View>
    );
  }
  return (
    <Card style={styles.card}>
      <Text style={styles.heading}>Shop Time & Training</Text>
      <Text style={styles.body}>Track Shop Time and Training separately from customer jobs. Daily Clock employees stay on their workday clock; Job Time employees do not need a Daily Clock. Completed time is submitted for review.</Text>
      {!isConnected && <Text style={styles.warning}>Reconnect to start or stop internal time.</Text>}
      {loading && <ActivityIndicator color={Colors.primary[600]} />}
      {!!error && <Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
      {!!data?.active && !activeInternal && <Text style={styles.warning}>A job timer is running. Stop it before starting internal time.</Text>}
      {button('Refresh sessions', () => { void refresh(); }, busy || !isConnected)}
      {data?.sessions.map(sessionRow)}
      {!loading && !error && !data?.sessions.length && <Text style={styles.body}>Choose Shop Time or Training to start recording internal work.</Text>}
      {!requestType && (
        <View style={styles.requests}>
          {button('Start Shop Time', () => openRequest('shop_time'), noNewStarts)}
          {button('Start Training', () => openRequest('training'), noNewStarts)}
        </View>
      )}
      {!!requestType && (
        <View style={styles.session}>
          <Text style={styles.sessionTitle}>Start {label(requestType)}</Text>
          <Text style={styles.body}>Add an optional note, then start your timer. Recorded hours stay pending until a manager approves them for payroll.</Text>
          <TextInput accessibilityLabel="Internal time notes" placeholder="What will you be working on?" multiline maxLength={2000}
            editable={!busy} value={reason} onChangeText={setReason} style={styles.input} />
          {button('Start timer', () => { void perform(
            () => startNewInternalTime(profile!, requestType, reason, requestId),
            () => { setRequestType(null); },
          ); }, noNewStarts)}
          {button('Cancel', () => setRequestType(null), busy)}
        </View>
      )}
      {busy && <ActivityIndicator accessibilityLabel="Saving internal time" color={Colors.primary[600]} />}
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { marginVertical: Spacing.lg },
  heading: { ...Typography.heading, marginBottom: Spacing.sm },
  body: { ...Typography.body, color: Colors.gray[600], marginBottom: Spacing.sm, lineHeight: 21 },
  warning: { ...Typography.body, color: Colors.amber[700], marginVertical: Spacing.sm },
  session: { borderTopWidth: 1, borderColor: Colors.gray[200], paddingTop: Spacing.lg, marginTop: Spacing.lg },
  sessionType: { ...Typography.caption, color: Colors.primary[600], fontWeight: '700', marginBottom: Spacing.xs },
  sessionTitle: { ...Typography.subheading, marginBottom: Spacing.sm },
  status: { ...Typography.caption, color: Colors.gray[600], fontWeight: '600', marginBottom: Spacing.sm },
  elapsed: { fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'], color: Colors.primary[700], marginBottom: Spacing.sm },
  input: { borderWidth: 1, borderColor: Colors.gray[300], borderRadius: Radius.md, padding: Spacing.md, minHeight: 70, textAlignVertical: 'top', color: Colors.gray[900], marginVertical: Spacing.sm },
  button: { backgroundColor: Colors.primary[600], borderRadius: Radius.md, minHeight: 46, justifyContent: 'center', padding: Spacing.md, marginTop: Spacing.sm },
  buttonText: { color: Colors.white, textAlign: 'center', fontWeight: '600', fontSize: 14 },
  stop: { backgroundColor: Colors.red[500] },
  disabled: { opacity: 0.45 },
  requests: { marginTop: Spacing.sm },
  durations: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginVertical: Spacing.sm },
  duration: { padding: Spacing.md, minHeight: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gray[300] },
  selected: { backgroundColor: Colors.primary[100], borderColor: Colors.primary[600] },
  durationText: { color: Colors.primary[700], fontWeight: '600' },
});
