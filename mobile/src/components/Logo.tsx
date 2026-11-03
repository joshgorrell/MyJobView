import React from 'react';
import { Image, StyleSheet } from 'react-native';

interface LogoProps {
  size?: number;
  variant?: 'light' | 'dark';
}

// Use the same approved MyJobView artwork as the iOS app icon and splash screen.
export function Logo({ size = 80 }: LogoProps) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      accessibilityLabel="MyJobView logo"
      resizeMode="contain"
      style={[styles.logo, { width: size, height: size }]}
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    alignSelf: 'center',
  },
});
