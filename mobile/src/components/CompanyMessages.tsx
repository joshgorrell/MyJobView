import React, { useCallback, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabase';
import { Colors } from '../theme/colors';
import { Typography, Radius } from '../theme/styles';
import { useThemedStyles } from '../theme/ThemeContext';

type Priority = 'urgent' | 'high' | 'normal' | 'low';
type MessageType = 'news' | 'alert' | 'announcement' | 'info';

interface CompanyMessage {
  id: string;
  message: string;
  priority: Priority;
  type: MessageType;
}

const priorityRank: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const typeLabels: Record<MessageType, string> = {
  news: 'News',
  alert: 'Alert',
  announcement: 'Announcement',
  info: 'Information',
};

export function CompanyMessages({ organizationId }: { organizationId: string }) {
  const themedStyles = useThemedStyles(styles);
  const [messages, setMessages] = useState<CompanyMessage[]>([]);

  useFocusEffect(useCallback(() => {
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const now = new Date().toISOString();
      const [posts, birthdays] = await Promise.all([
        supabase.from('company_messages')
          .select('id, message, priority, type')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .lte('start_date', now)
          .or('end_date.is.null,end_date.gte.' + now)
          .order('created_at', { ascending: false })
          .abortSignal(request.signal),
        supabase.rpc('get_todays_company_birthdays').abortSignal(request.signal),
      ]);
      if (request.signal.aborted) return;

      const next = [...(posts.data || [])] as CompanyMessage[];
      const names = (birthdays.data || [])
        .map((row: { full_name: string }) => row.full_name)
        .filter(Boolean);
      if (names.length > 0) {
        next.unshift({
          id: 'company-birthdays',
          message: names.length === 1
            ? `🎉 Happy Birthday, ${names[0]}! 🎂`
            : `🎉 Happy Birthday to ${names.join(', ')}! 🎂`,
          priority: 'normal',
          type: 'announcement',
        });
      }
      setMessages(next.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]));
    };

    const refreshIfActive = () => {
      if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') {
        void refresh().catch(() => {});
      }
    };
    refreshIfActive();
    const interval = setInterval(refreshIfActive, 60_000);
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') refreshIfActive();
    });
    return () => {
      controller?.abort();
      foreground.remove();
      clearInterval(interval);
    };
  }, [organizationId]));

  if (messages.length === 0) return null;

  return (
    <View style={themedStyles.section}>
      <Text accessibilityRole="header" style={themedStyles.heading}>Company Messages</Text>
      {messages.map(item => (
        <View key={item.id} style={[
          themedStyles.card,
          item.priority === 'urgent' && themedStyles.urgent,
          item.priority === 'high' && themedStyles.high,
        ]}>
          <Text style={themedStyles.label}>
            {item.priority === 'urgent' ? 'Urgent · ' : item.priority === 'high' ? 'High priority · ' : ''}
            {typeLabels[item.type]}
          </Text>
          <Text selectable style={themedStyles.message}>{item.message}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginBottom: 16, gap: 8 },
  heading: { ...Typography.subheading, color: Colors.gray[900] },
  card: {
    backgroundColor: Colors.white,
    borderColor: Colors.gray[200],
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: 14,
    gap: 4,
  },
  urgent: { borderColor: Colors.red[500] },
  high: { borderColor: Colors.amber[500] },
  label: { ...Typography.label, color: Colors.gray[500] },
  message: { ...Typography.body, color: Colors.gray[900] },
});
