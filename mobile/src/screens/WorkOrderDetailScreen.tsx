import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';

export default function WorkOrderDetailScreen({ route }: any) {
  const { workOrderId } = route.params;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Work Order Details</Text>
        <Text style={styles.text}>Work Order ID: {workOrderId}</Text>
        <Text style={styles.infoText}>
          Detailed view coming soon. This will include full work order information,
          customer details, tasks, parts needed, and completion status.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  text: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
});
