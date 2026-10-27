import React from 'react';
import { View, Text, StyleSheet, Platform, ViewStyle } from 'react-native';
import { Colors } from '../theme/colors';
import { Spacing, Radius, Shadows, Typography } from '../theme/styles';

type BadgeVariant = 'blue' | 'green' | 'amber' | 'red' | 'gray';

const variantColors: Record<BadgeVariant, string> = {
  blue: Colors.primary[100],
  green: Colors.green[100],
  amber: Colors.amber[100],
  red: Colors.red[100],
  gray: Colors.gray[200],
};

const variantText: Record<BadgeVariant, string> = {
  blue: Colors.primary[700],
  green: Colors.green[700],
  amber: Colors.amber[700],
  red: Colors.red[700],
  gray: Colors.gray[600],
};

export function Badge({ label, variant = 'gray' }: { label: string; variant?: BadgeVariant }) {
  return (
    <View style={[styles.badge, { backgroundColor: variantColors[variant] }]}>
      <Text style={[styles.badgeText, { color: variantText[variant] }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatusDot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={[styles.statusDot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} />;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.pill,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  card: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    ...Shadows.small,
  },
  statusDot: {},
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: Spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxxl * 2,
  },
  emptyTitle: {
    ...Typography.title,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    textAlign: 'center',
    color: '#94a3b8',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  infoLabel: {
    ...Typography.body,
    color: Colors.gray[500],
    flex: 1,
  },
  infoValue: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.gray[800],
  },
});
