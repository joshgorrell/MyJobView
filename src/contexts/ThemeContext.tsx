import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type ThemePreference = 'light' | 'dark' | 'classic' | 'system';
type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: 'light' | 'dark' | 'classic';
  setPreference: (value: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const validTheme = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'classic' || value === 'system';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!profile) return;
    const saved = localStorage.getItem(`mjv-theme-${profile.id}`);
    setPreferenceState(validTheme(saved) ? saved : validTheme(profile.ui_theme) ? profile.ui_theme : 'dark');
  }, [profile?.id, profile?.ui_theme]);

  const resolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark';
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
