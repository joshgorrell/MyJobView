import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    loadWorkOrders();
  }, []);

  async function loadWorkOrders() {
    if (!profile) return;

    try {
      if (isConnected) {
        // Load from server
        const { data, error } = await supabase
          .from('work_orders')
          .select('*')
          .eq('assigned_technician_id', profile.id)
          .in('status', ['pending', 'in_progress', 'scheduled'])
          .order('scheduled_date', { ascending: true })
          .limit(50);

        if (error) throw error;

        setWorkOrders(data || []);

        // Cache for offline use
        await offlineStorage.cacheWorkOrders(data || []);
      } else {
        // Load from cache
        const cached = await offlineStorage.getCachedWorkOrders(profile.id);
        setWorkOrders(cached);
      }
    } catch (error) {
      console.error('Error loading work orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadWorkOrders();
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'pending':
        return '#f59e0b';
      case 'in_progress':
        return '#3b82f6';
      case 'scheduled':
        return '#8b5cf6';
      case 'completed':
        return '#10b981';
      default:
        return '#6b7280';
    }
  }

  function getTypeIcon(type: string): string {
    switch (type) {
      case 'installation':
        return '🔧';
      case 'service':
        return '🛠️';
      case 'maintenance':
        return '⚙️';
      case 'inspection':
        return '🔍';
      case 'emergency':
        return '🚨';
      default:
        return '📋';
    }
  }

  function renderWorkOrder({ item }: { item: WorkOrder }) {
    return (
      <TouchableOpacity
        style={styles.workOrderCard}
        onPress={() => navigation.navigate('WorkOrderDetail', { workOrderId: item.id })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.typeContainer}>
            <Text style={styles.typeIcon}>{getTypeIcon(item.work_order_type)}</Text>
            <Text style={styles.workOrderNumber}>{item.work_order_number}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status.replace('_', ' ')}</Text>
          </View>
        </View>

        <Text style={styles.customerName}>{item.customer_name}</Text>

        {item.address && (
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📍</Text>
            <Text style={styles.infoText}>{item.address}</Text>
          </View>
        )}

        {item.scheduled_date && (
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📅</Text>
            <Text style={styles.infoText}>
              {new Date(item.scheduled_date).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
        )}

        {item.description && (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.viewDetails}>View Details →</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading work orders...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>📱 Viewing cached work orders</Text>
        </View>
      )}

      <FlatList
        data={workOrders}
        renderItem={renderWorkOrder}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Work Orders</Text>
            <Text style={styles.emptyText}>
              You don't have any assigned work orders at the moment.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#6b7280',
  },
  offlineBanner: {
    backgroundColor: '#fef3c7',
    padding: 12,
    alignItems: 'center',
  },
  offlineText: {
    color: '#78350f',
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  workOrderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeIcon: {
    fontSize: 24,
  },
  workOrderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    lineHeight: 20,
  },
  cardFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  viewDetails: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
