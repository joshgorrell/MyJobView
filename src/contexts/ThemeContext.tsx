import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type ThemePreference = 'light' | 'dark' | 'classic' | 'mjv';
type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ThemePreference;
  setPreference: (value: ThemePreference) => Promise<void>;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);
const validTheme = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'classic' || value === 'mjv';
const normalize = (value: unknown) => value === 'system' ? 'mjv' : value;
function cacheTheme(userId: string, theme: ThemePreference) {
  // Storage may be unavailable in private browsing. Account saving still works.
  try { localStorage.setItem(`mjv-theme-${userId}`, theme); } catch { /* optional cache */ }
}
function readCache(userId: string) {
  try { return normalize(localStorage.getItem(`mjv-theme-${userId}`)); } catch { return null; }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile, setProfileTheme } = useAuth();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const activeUser = useRef(profile?.id);
  activeUser.current = profile?.id;
  const saving = useRef(false);

  useEffect(() => {
    if (!profile) { setPreferenceState('dark'); return; }
    const accountTheme = normalize(profile.ui_theme);
    const cached = readCache(profile.id);
    // The loaded account preference always wins over an older device cache.
    const next = validTheme(accountTheme) ? accountTheme : validTheme(cached) ? cached : 'dark';
    setPreferenceState(next);
    cacheTheme(profile.id, next);
  }, [profile?.id, profile?.ui_theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = preference;
    document.documentElement.style.colorScheme = preference === 'light' || preference === 'mjv' ? 'light' : 'dark';
  }, [preference]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    resolvedTheme: preference,
    async setPreference(next) {
      if (!profile || !validTheme(next)) throw new Error('A signed-in user and valid theme are required.');
      if (saving.current) throw new Error('A theme save is already in progress.');
      const userId = profile.id;
      const previous = preference;
      saving.current = true;
      setPreferenceState(next);
      try {
        // Returning the row catches RLS updates that affect zero rows as well as API errors.
        const { data, error } = await supabase.from('profiles').update({ ui_theme: next })
          .eq('id', userId).select('id, ui_theme').single();
        if (error) throw error;
        if (data?.id !== userId || data.ui_theme !== next) throw new Error('Theme preference was not saved.');
        cacheTheme(userId, next);
        if (activeUser.current === userId) setProfileTheme(userId, next);
      } catch (error) {
        if (activeUser.current === userId) setPreferenceState(previous);
        throw error;
      } finally { saving.current = false; }
    },
  }), [preference, profile?.id, setProfileTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
