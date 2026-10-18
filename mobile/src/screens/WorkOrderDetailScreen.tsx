import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { openMJV } from '../services/OpenMJV';
import { supabase } from '../services/supabase';
import { Colors } from '../theme/colors';
import { Typography, Spacing, Radius, Shadows } from '../theme/styles';
import { Badge, Card, InfoRow, Divider } from '../components/UI';

export default function WorkOrderDetailScreen({ route, navigation }: any) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [workOrder, setWorkOrder] = useState<any>(route.params?.workOrder || null);
  const [jobTime, setJobTime] = useState<{ active: boolean; clockIn: string | null; totalHours: number } | null>(null);

  const workOrderId = route.params?.workOrderId;

  useEffect(() => {
    if (workOrderId) loadWorkOrderDetails();
  }, [workOrderId]);

  async function loadWorkOrderDetails() {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select('*')
        .eq('id', workOrderId)
        .maybeSingle();
      if (error) throw error;
      if (data) setWorkOrder(data);

      const { data: timeEntry, error: timeError } = await supabase
        .from('time_entries')
        .select('id, clock_in, clock_out')
        .eq('technician_id', profile.id)
        .eq('work_order_id', workOrderId)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (timeError) throw timeError;

      if (timeEntry) {
        setJobTime({ active: true, clockIn: timeEntry.clock_in, totalHours: 0 });
      } else {
        const { data: completed } = await supabase
          .from('time_entries')
          .select('total_hours')
          .eq('technician_id', profile.id)
          .eq('work_order_id', workOrderId)
          .not('clock_out', 'is', null)
          .maybeSingle();
        setJobTime({ active: false, clockIn: null, totalHours: completed?.total_hours || 0 });
      }
    } catch (error) {
      console.error('Error loading work order:', error);
    } finally {
      setLoading(false);
    }
  }

  async function open() {
    if (!profile || opening) return;
    setOpening(true);
    try {
      await openMJV(profile.id, { tab: 'work_orders', workOrderId });
    } catch (error: any) {
      Alert.alert('Unable to open Work Order', error.message);
    } finally {
      setOpening(false);
    }
  }

  function getStatusVariant(status: string): 'blue' | 'green' | 'amber' | 'red' | 'gray' {
    if (status === 'in_progress') return 'blue';
    if (status === 'completed') return 'green';
    if (status === 'pending') return 'amber';
    return 'gray';
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary[600]} />
      </View>
    );
  }

  if (!workOrder) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.notFoundText}>Work order not found</Text>
      </View>
    );
  }

  const wo = workOrder;
  const statusLabel = wo.status ? wo.status.replace(/_/g, ' ') : 'Unknown';

  return (
    <ScrollView style={styles.container}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.woNumber}>{wo.work_order_number}</Text>
            <Badge label={wo.work_order_type} variant="blue" />
          </View>
          <Badge label={statusLabel} variant={getStatusVariant(wo.status)} />
        </View>
        <Text style={styles.customerName}>{wo.customer_name}</Text>
        {wo.description ? <Text style={styles.description}>{wo.description}</Text> : null}
      </View>

      {/* Job Time Card */}
      {jobTime && (
        <Card style={styles.timeCard}>
          <Text style={styles.cardTitle}>Job Time</Text>
          {jobTime.active ? (
            <View style={styles.activeJobSection}>
              <View style={styles.activeJobBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeJobText}>Active</Text>
              </View>
              <Text style={styles.activeJobTime}>
                Started at {jobTime.clockIn ? formatTime(jobTime.clockIn) : '--'}
              </Text>
            </View>
          ) : (
            <InfoRow label="Hours on this job" value={`${jobTime.totalHours.toFixed(2)}h`} />
          )}
        </Card>
      )}

      {/* Job Details */}
      <Card style={styles.detailsCard}>
        <Text style={styles.cardTitle}>Details</Text>
        {wo.scheduled_date ? <InfoRow label="Scheduled" value={formatDate(wo.scheduled_date)} /> : null}
        {wo.address ? (
          <View style={styles.addressSection}>
            <Text style={styles.addressLabel}>Job Site Address</Text>
            <Text style={styles.addressValue}>{wo.address}</Text>
          </View>
        ) : null}
        {wo.work_order_type ? <InfoRow label="Type" value={wo.work_order_type} /> : null}
      </Card>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.primaryButton} onPress={open} disabled={opening} activeOpacity={0.85}>
          {opening ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Open Full Work Order</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.actionHint}>
          Opens the complete work order in your browser for job time, parts, notes, photos, and completion.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[100] },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gray[100] },
  headerCard: {
    margin: Spacing.lg, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.xxl, ...Shadows.small,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  woNumber: { fontSize: 20, fontWeight: '700', color: Colors.gray[900], marginBottom: Spacing.sm },
  customerName: { fontSize: 24, fontWeight: '700', color: Colors.gray[900], marginBottom: Spacing.sm },
  description: { fontSize: 14, color: Colors.gray[500], lineHeight: 22 },
  timeCard: { marginBottom: Spacing.lg },
  cardTitle: { ...Typography.heading, marginBottom: Spacing.md },
  activeJobSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activeJobBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.green[500] },
  activeJobText: { fontSize: 16, fontWeight: '700', color: Colors.green[600] },
  activeJobTime: { ...Typography.body, color: Colors.gray[500] },
  detailsCard: { marginBottom: Spacing.lg },
  addressSection: { paddingVertical: Spacing.md },
  addressLabel: { ...Typography.caption, color: Colors.gray[500], marginBottom: Spacing.xs },
  addressValue: { ...Typography.body, color: Colors.gray[800], lineHeight: 20 },
  actionsContainer: { padding: Spacing.lg, paddingTop: Spacing.sm },
  primaryButton: {
    backgroundColor: Colors.primary[600], borderRadius: Radius.md, paddingVertical: Spacing.lg + 2,
    alignItems: 'center', ...Shadows.small,
  },
  primaryButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  actionHint: { ...Typography.caption, color: Colors.gray[400], textAlign: 'center', marginTop: Spacing.md, lineHeight: 18 },
  notFoundText: { ...Typography.body, color: Colors.gray[500] },
});
