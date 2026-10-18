import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { offlineStorage } from '../services/OfflineStorage';
import { NotificationService } from '../services/NotificationService';
import { Colors } from '../theme/colors';
import { Typography, Spacing, Radius, Shadows } from '../theme/styles';
import { Badge, EmptyState } from '../components/UI';
import { ScreenContainer } from '../components/ScreenContainer';

interface WorkOrder {
  id: string;
  work_order_number: string;
  work_order_type: string;
  status: string;
  scheduled_date: string;
  address: string;
  customer_name: string;
  description: string;
}

export default function WorkOrdersScreen({ navigation }: any) {
  const { profile } = useAuth();
  const { isConnected } = useOffline();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadWorkOrders = useCallback(async () => {
    if (!profile) return;
    try {
      if (isConnected) {
        const { data, error } = await supabase
          .from('work_orders')
          .select('*')
          .eq('assigned_to', profile.id)
          .in('status', ['pending', 'in_progress', 'scheduled'])
          .order('scheduled_date', { ascending: true })
          .limit(50);
        if (error) throw error;
        setWorkOrders(data || []);
        await offlineStorage.cacheWorkOrders(data || []);
      } else {
        const cached = await offlineStorage.getCachedWorkOrders(profile.id);
        setWorkOrders(cached);
      }
    } catch (error) {
      console.error('Error loading work orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile, isConnected]);

  useEffect(() => {
    loadWorkOrders();
    if (profile) {
      NotificationService.getUnreadCount(profile.id).then(setUnreadCount);
    }
  }, [loadWorkOrders, profile]);

  // Realtime subscription: refresh work orders when any change is made by admin
  useEffect(() => {
    if (!profile || !isConnected) return;

    const channel = supabase
      .channel('work-orders-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders', filter: `assigned_to=eq.${profile.id}` },
        (payload) => {
          loadWorkOrders();
          if (payload.eventType === 'UPDATE' && profile) {
            NotificationService.getUnreadCount(profile.id).then(setUnreadCount);
          }
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => {
          if (profile) NotificationService.getUnreadCount(profile.id).then(setUnreadCount);
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [profile, isConnected, loadWorkOrders]);

  function onRefresh() {
    setRefreshing(true);
    loadWorkOrders();
  }

  function getBadgeVariant(status: string): 'blue' | 'green' | 'amber' | 'red' | 'gray' {
    if (status === 'in_progress') return 'blue';
    if (status === 'completed') return 'green';
    if (status === 'pending') return 'amber';
    if (status === 'scheduled') return 'blue';
    if (status === 'cancelled') return 'gray';
    return 'gray';
  }

  function getTypeBadgeVariant(type: string): 'blue' | 'green' | 'amber' | 'red' | 'gray' {
    switch (type) {
      case 'service': return 'green';
      case 'maintenance': return 'amber';
      case 'emergency': return 'red';
      case 'inspection': return 'blue';
      default: return 'blue';
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function renderWorkOrder({ item }: { item: WorkOrder }) {
    return (
      <TouchableOpacity
        style={styles.workOrderCard}
        onPress={() => navigation.navigate('WorkOrderDetail', { workOrderId: item.id, workOrder: item })}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Badge label={item.work_order_type} variant={getTypeBadgeVariant(item.work_order_type)} />
            <Text style={styles.workOrderNumber}>{item.work_order_number}</Text>
          </View>
          <Badge label={item.status.replace(/_/g, ' ')} variant={getBadgeVariant(item.status)} />
        </View>

        <Text style={styles.customerName}>{item.customer_name}</Text>

        {item.address ? (
          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <View style={styles.locationPin} />
            </View>
            <Text style={styles.infoText} numberOfLines={2}>{item.address}</Text>
          </View>
        ) : null}

        {item.scheduled_date ? (
          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <View style={styles.calendarIcon} />
            </View>
            <Text style={styles.infoText}>{formatDate(item.scheduled_date)}</Text>
          </View>
        ) : null}

        {item.description ? (
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        ) : null}

        <View style={styles.cardFooter}>
          <Text style={styles.viewDetailsText}>View Details</Text>
          <View style={styles.chevronRight} />
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <ScreenContainer center>
        <ActivityIndicator size="large" color={Colors.primary[600]} />
        <Text style={styles.loadingText}>Loading work orders...</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Viewing cached work orders</Text>
        </View>
      )}

      <FlatList
        data={workOrders}
        renderItem={renderWorkOrder}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary[600]]} />}
        ListEmptyComponent={
          <EmptyState title="No Work Orders" message="You don't have any assigned work orders at the moment." />
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[100] },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gray[100] },
  loadingText: { marginTop: Spacing.md, color: Colors.gray[500] },
  offlineBanner: { backgroundColor: Colors.amber[100], padding: Spacing.md + 2, alignItems: 'center' },
  offlineText: { color: Colors.amber[700], fontSize: 14, fontWeight: '600' },
  listContainer: { padding: Spacing.lg },
  workOrderCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg + 2,
    marginBottom: Spacing.lg, ...Shadows.small,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  workOrderNumber: { fontSize: 16, fontWeight: '700', color: Colors.gray[900] },
  customerName: { fontSize: 18, fontWeight: '600', color: Colors.gray[900], marginBottom: Spacing.sm + 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm + 2 },
  infoIconContainer: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
  locationPin: {
    width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.gray[400],
    borderBottomColor: 'transparent', borderLeftColor: 'transparent', transform: [{ rotate: '135deg' }],
  },
  calendarIcon: {
    width: 14, height: 12, borderRadius: 2, borderWidth: 1.5, borderColor: Colors.gray[400],
    borderTopWidth: 3,
  },
  infoText: { fontSize: 14, color: Colors.gray[500], flex: 1 },
  description: { fontSize: 14, color: Colors.gray[500], marginTop: Spacing.sm, lineHeight: 20 },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md, paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray[200],
  },
  viewDetailsText: { fontSize: 14, color: Colors.primary[600], fontWeight: '600', flex: 1 },
  chevronRight: {
    width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: Colors.primary[400],
    transform: [{ rotate: '45deg' }],
  },
});
