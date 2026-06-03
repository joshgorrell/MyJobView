import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';

export default function LocationHistoryScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Location History</Text>
        <Text style={styles.infoText}>
          View your complete GPS tracking history, including routes, mileage,
          and accuracy metrics. This feature will show a map of your daily routes
          and detailed statistics about your location tracking.
        </Text>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonIcon}>🗺️</Text>
          <Text style={styles.comingSoonText}>Coming Soon</Text>
        </View>
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
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 24,
  },
  comingSoon: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    marginTop: 20,
  },
  comingSoonIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  comingSoonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
  },
});
