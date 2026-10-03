import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type ThemePreference = 'light' | 'dark' | 'classic' | 'mjv';
type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: 'light' | 'dark' | 'classic' | 'mjv';
  setPreference: (value: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const validTheme = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'classic' || value === 'mjv';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  useEffect(() => {
    if (!profile) return;
    const saved = localStorage.getItem(`mjv-theme-${profile.id}`);
    // System was replaced by the branded MJV choice; migrate older preferences.
    const normalized = saved === 'system' ? 'mjv' : saved;
    const accountTheme = profile.ui_theme === 'system' ? 'mjv' : profile.ui_theme;
    setPreferenceState(validTheme(normalized) ? normalized : validTheme(accountTheme) ? accountTheme : 'dark');
    if (saved === 'system') localStorage.setItem(`mjv-theme-${profile.id}`, 'mjv');
  }, [profile?.id, profile?.ui_theme]);

  const resolvedTheme = preference;
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme === 'light' || resolvedTheme === 'mjv' ? 'light' : 'dark';
  }, [resolvedTheme]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    resolvedTheme,
    async setPreference(next) {
      if (!profile) return;
      const previous = preference;
      setPreferenceState(next);
      localStorage.setItem(`mjv-theme-${profile.id}`, next);
      const { error } = await supabase.from('profiles').update({ ui_theme: next }).eq('id', profile.id);
      if (error) {
        // A preview branch can run before its additive migration is applied.
        // Keep the browser preference for visual QA; account sync begins after migration.
        if (error.code === '42703' || error.code === 'PGRST204' || error.code === '23514') return;
        setPreferenceState(previous);
        localStorage.setItem(`mjv-theme-${profile.id}`, previous);
        throw error;
      }
    },
  }), [preference, profile?.id, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
