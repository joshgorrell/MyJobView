import { useTheme, useThemedStyles } from '../theme/ThemeContext';
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
  const themedStyles = useThemedStyles(styles);
  return (
    <View style={[themedStyles.badge, { backgroundColor: variantColors[variant] }]}>
      <Text style={[themedStyles.badgeText, { color: variantText[variant] }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const themedStyles = useThemedStyles(styles);
  return <View style={[themedStyles.card, style]}>{children}</View>;
}

export function StatusDot({ color, size = 8 }: { color: string; size?: number }) {
  const themedStyles = useThemedStyles(styles);
  return <View style={[themedStyles.statusDot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} />;
}

export function Divider() {
  const themedStyles = useThemedStyles(styles);
  return <View style={themedStyles.divider} />;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  const themedStyles = useThemedStyles(styles);
  return (
    <View style={themedStyles.emptyContainer}>
      <Text style={themedStyles.emptyTitle}>{title}</Text>
      <Text style={themedStyles.emptyText}>{message}</Text>
    </View>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  const themedStyles = useThemedStyles(styles);
  return (
    <View style={themedStyles.infoRow}>
      <Text style={themedStyles.infoLabel}>{label}</Text>
      <Text style={themedStyles.infoValue}>{value}</Text>
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
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    ...Shadows.small,
  },
  statusDot: {},
  divider: {
    height: 1,
    backgroundColor: Colors.gray[200],
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
    color: Colors.gray[400],
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
