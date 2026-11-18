import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme, type TextStyle, type ViewStyle } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type Appearance = 'light' | 'dark' | 'system';
const KEY = 'mjv-mobile-appearance';
type ThemeContextValue = { appearance: Appearance; dark: boolean; setAppearance: (value: Appearance) => void };
const ThemeContext = createContext<ThemeContextValue>({ appearance: 'system', dark: false, setAppearance: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [appearance, setPreference] = useState<Appearance>('system');
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(KEY).then(value => {
      if (active && (value === 'light' || value === 'dark' || value === 'system')) setPreference(value);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const setAppearance = (value: Appearance) => {
    setPreference(value);
    SecureStore.setItemAsync(KEY, value).catch(() => {});
  };
  const dark = appearance === 'dark' || (appearance === 'system' && system === 'dark');
  const value = useMemo(() => ({ appearance, dark, setAppearance }), [appearance, dark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// Convert existing light-mode surface/text styles consistently without changing semantic status colors.
const darkColors: Record<string, string> = {
  '#ffffff': '#171b24',
  '#f9fafb': '#10141c',
  '#f3f4f6': '#10141c',
  '#e5e7eb': '#303744',
  '#d1d5db': '#485161',
  '#9ca3af': '#a5adba',
  '#6b7280': '#b3bac6',
  '#4b5563': '#c4cad4',
  '#374151': '#d6dbe4',
  '#1f2937': '#e8ebf0',
  '#111827': '#f5f7fb',
};
export function themeColor(color: string, dark: boolean) {
  return dark ? (darkColors[color.toLowerCase()] || color) : color;
}
export function useThemedStyles<T extends Record<string, any>>(styles: T): T {
  const { dark } = useTheme();
  return useMemo(() => {
    if (!dark) return styles;
    const result: Record<string, any> = {};
    for (const [name, style] of Object.entries(styles)) {
      if (!style || typeof style !== 'object') { result[name] = style; continue; }
      const next: Record<string, any> = { ...style };
      for (const key of ['backgroundColor', 'color', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor']) {
        if (typeof next[key] === 'string') next[key] = themeColor(next[key], true);
      }
      result[name] = next;
    }
    return result as T;
  }, [dark, styles]);
}
