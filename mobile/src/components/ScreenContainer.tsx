import React from 'react';
import { View, ScrollView, ViewStyle, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';

const TABLET_MAX_WIDTH = 720;

function useTabletAwareStyles() {
  const insets = useSafeAreaInsets();
  const contentMaxWidth = TABLET_MAX_WIDTH;
  return { insets, contentMaxWidth };
}

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  center?: boolean;
}

export function ScreenContainer({
  children,
  scroll = false,
  style,
  contentStyle,
  center = false,
}: ScreenContainerProps) {
  const { insets, contentMaxWidth } = useTabletAwareStyles();

  const baseStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
  };

  const innerStyle: ViewStyle = {
    maxWidth: contentMaxWidth,
    width: '100%',
    alignSelf: 'center',
    ...(center ? { justifyContent: 'center', alignItems: 'center' } : {}),
    ...contentStyle,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[baseStyle, style]}
        contentContainerStyle={innerStyle}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[baseStyle, style]}>
      <View style={innerStyle}>{children}</View>
    </View>
  );
}

interface SafeHeaderProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function SafeHeader({ children, style }: SafeHeaderProps) {
  const { insets, contentMaxWidth } = useTabletAwareStyles();

  return (
    <View style={[safeHeaderStyles.outer, { paddingTop: insets.top }]}>
      <View style={[safeHeaderStyles.inner, { maxWidth: contentMaxWidth }, style]}>
        {children}
      </View>
    </View>
  );
}

const safeHeaderStyles = StyleSheet.create({
  outer: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  inner: {
    width: '100%',
    alignSelf: 'center',
  },
});
