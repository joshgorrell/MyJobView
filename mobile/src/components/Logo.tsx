import React from 'react';
import { Image } from 'react-native';

interface LogoProps {
  size?: number;
  variant?: 'light' | 'dark';
}

// Use the official MJV icon asset, never a hand-drawn placeholder.
export function Logo({ size = 80 }: LogoProps) {
  return <Image source={require('../../assets/MJV_icon_1024_x_1024_for_IOS.png')} style={{ width: size, height: size, borderRadius: size * 0.2 }} resizeMode="contain" accessibilityLabel="MyJobView logo" />;
}
