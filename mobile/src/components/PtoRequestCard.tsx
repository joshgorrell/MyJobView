import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../services/supabase';
import { workDate } from '../services/EmployeeTimeContext';
import { useThemedStyles } from '../theme/ThemeContext';

const categories = [{ id: 'sick', label: 'Sick' }, { id: 'vacation', label: 'Vacation' }];
const durations = [
  { id: 'full_day', label: 'Full day' },
  { id: 'half_day', label: 'Half day' },
  { id: 'hours', label: 'Specific hours' },
];
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(value).toJSON()?.slice(0, 10) === value;

export function PtoRequestCard({ employeeId, timezone }: { employeeId: string; timezone: string }) {
  const style = useThemedStyles(styles);
  const today = workDate(new Date(), timezone);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [type, setType] = useState('full_day');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [reason, setReason] = useState('');
  const [called, setCalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<number | null>(null);

  const lastDay = type === 'hours' ? start : end || start;
  const sameDay = start === today;
  const params = {
    p_start: start, p_end: lastDay, p_type: type,
    p_start_time: type === 'full_day' ? null : startTime,
    p_end_time: type === 'full_day' ? null : endTime,
  };

  function change(update: () => void) {
    update();
    setPreview(null);
    setError('');
  }

  async function next() {
    if (busy || !category) return;
    if (!validDate(start) || !validDate(lastDay) || start < today || lastDay < start) {
      setError('Enter a valid date range starting today or later.');
      return;
    }
    if (type !== 'full_day' && ![startTime, endTime].every(time => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      setError('Enter times in 24-hour HH:MM format.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (preview === null) {
        const { data, error: previewError } = await supabase.rpc('preview_time_off', params);
        if (previewError) throw new Error(previewError.message);
        setPreview((data as { hours: number | string }[]).reduce((sum, day) => sum + Number(day.hours), 0));
        return;
      }
      const { data: balances, error: balanceError } = await supabase.from('pto_balances')
        .select('policy_id').eq('employee_id', employeeId).limit(2);
      if (balanceError) throw new Error(balanceError.message);
      if (balances.length !== 1) throw new Error('Ask your manager to verify your PTO balance setup.');
      const { error: submitError } = await supabase.rpc('submit_classified_pto', {
        ...params, p_policy: balances[0].policy_id, p_category: category, p_called_manager: called, p_reason: reason || null,
      });
      if (submitError) throw new Error(submitError.message);
      setOpen(false);
      setPreview(null);
      Alert.alert('PTO request submitted', 'Your request is pending manager approval.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'PTO request unavailable. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const buttons = (options: typeof categories, value: string, select: (id: string) => void) => (
    <View style={style.row}>
      {options.map(({ id, label }) => (
        <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: value === id }}
          disabled={busy} style={[style.button, value === id && style.selected]}
          onPress={() => change(() => select(id))}>
          <Text style={style.text}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );

  const field = (label: string, value: string, update: (value: string) => void, placeholder: string) => (
    <View>
      <Text style={style.text}>{label}</Text>
      <TextInput accessibilityLabel={label} style={style.input} value={value} placeholder={placeholder}
        placeholderTextColor="#64748b" editable={!busy} autoCapitalize="none" autoCorrect={false}
        onChangeText={nextValue => change(() => update(nextValue))} />
    </View>
  );

  if (!open) return (
    <Pressable accessibilityRole="button" style={style.button} onPress={() => {
      setStart(today);
      setEnd('');
      setCategory('');
      setType('full_day');
      setStartTime('08:00');
      setEndTime('12:00');
      setReason('');
      setCalled(false);
      setPreview(null);
      setError('');
      setOpen(true);
    }}>
      <Text style={style.text}>Request PTO</Text>
    </Pressable>
  );

  const disabled = busy || !category || (preview !== null && sameDay && !called);
  return (
    <View style={style.card}>
      <Text accessibilityRole="header" style={style.title}>Request PTO</Text>
      <Text style={style.text}>PTO category</Text>
      {buttons(categories, category, setCategory)}
      <Text style={style.text}>Duration</Text>
      {buttons(durations, type, setType)}
      {field('Start date (YYYY-MM-DD)', start, value => { setStart(value); setCalled(false); }, today)}
      {type !== 'hours' && field('End date (optional, YYYY-MM-DD)', end, setEnd, start)}
      {type !== 'full_day' && (
        <>
          {field('Start time (HH:MM)', startTime, setStartTime, '08:00')}
          {field('End time (HH:MM)', endTime, setEndTime, '12:00')}
        </>
      )}
      <View>
        <Text style={style.text}>Reason (private, optional)</Text>
        <TextInput accessibilityLabel="Reason (private, optional)" style={style.input}
          value={reason} editable={!busy} multiline maxLength={5000} onChangeText={setReason} />
      </View>
      {sameDay && (
        <>
          <Text style={style.text}>Call your manager before submitting. Late call-ins may affect rewards points under company policy.</Text>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: called }} disabled={busy}
            style={[style.button, called && style.selected]} onPress={() => setCalled(!called)}>
            <Text style={style.text}>{called ? '✓ ' : ''}I personally called my manager</Text>
          </Pressable>
        </>
      )}
      {preview !== null && <Text accessibilityLiveRegion="polite" style={style.text}>{preview.toFixed(2)} hours requested</Text>}
      {!!error && <Text accessibilityRole="alert" style={style.text}>{error}</Text>}
      <View style={style.row}>
        <Pressable accessibilityRole="button" disabled={busy} style={style.button} onPress={() => setOpen(false)}>
          <Text style={style.text}>Cancel</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
          style={[style.button, style.selected, disabled && style.disabled]} onPress={next}>
          <Text style={style.text}>{busy ? 'Working…' : preview === null ? 'Review Hours' : 'Submit Request'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { color: '#111827', fontSize: 18, fontWeight: '700' },
  text: { color: '#111827', fontSize: 15 },
  input: { borderWidth: 1, borderColor: '#9ca3af', borderRadius: 8, minHeight: 44, paddingHorizontal: 10, color: '#111827' },
  button: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#9ca3af', borderRadius: 8, paddingHorizontal: 12 },
  selected: { borderColor: '#2563eb', backgroundColor: '#f3f4f6' },
  disabled: { opacity: 0.5 },
});
