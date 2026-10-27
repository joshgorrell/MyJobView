import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface LogoProps {
  size?: number;
  variant?: 'light' | 'dark';
}

export function Logo({ size = 80, variant = 'dark' }: LogoProps) {
  const primary = variant === 'light' ? Colors.white : Colors.primary[600];
  const foreground = variant === 'light' ? Colors.primary[700] : Colors.white;

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: primary }]}>
      <Text accessibilityLabel="MyJobView logo" style={{ color: foreground, fontSize: size * 0.34, fontWeight: '800' }}>MJV</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerShape: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: Colors.white,
    backgroundColor: 'transparent',
    marginBottom: -4,
  },
  pinStem: {
    width: 3,
    height: 14,
    backgroundColor: Colors.white,
    borderRadius: 2,
  },
});
