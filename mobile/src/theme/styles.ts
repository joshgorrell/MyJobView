import { StyleSheet, Platform, ViewStyle } from 'react-native';
import { Colors } from './colors';

export const Typography = {
  hero: {
    fontSize: 32,
    fontWeight: '700' as const,
    color: Colors.gray[900],
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.gray[900],
  },
  heading: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.gray[900],
  },
  subheading: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.gray[700],
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.gray[700],
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: Colors.gray[500],
  },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.gray[500],
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  mono: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.gray[700],
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
};

export const Shadows: Record<string, ViewStyle> = StyleSheet.create({
  small: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
    },
    android: { elevation: 2 },
  }) as ViewStyle,
  medium: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
    },
    android: { elevation: 4 },
  }) as ViewStyle,
  large: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
    },
    android: { elevation: 8 },
  }) as ViewStyle,
});

export const CommonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[100],
  },
  section: {
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    ...Typography.label,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    marginTop: Spacing.xxl,
  },
  card: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    ...Shadows.small,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
  },
});
