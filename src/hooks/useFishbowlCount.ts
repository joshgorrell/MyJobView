import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const FISHBOWL_SEEN_EVENT = 'fishbowl:seen';

export function useFishbowlCount(): number {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);
  const lastSeenRef = useRef<string | null>(profile?.last_seen_fishbowl_at ?? null);

  const loadCount = useCallback(async (overrideLastSeen?: string | null) => {
    if (!profile) {
      setCount(0);
      return;
    }

    try {
      const lastSeen = overrideLastSeen !== undefined ? overrideLastSeen : lastSeenRef.current;
      let query = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('is_fishbowl', true)
        .eq('status', 'unclaimed');

      if (lastSeen) {
        query = query.gt('created_at', lastSeen);
      }

      const { count: fishbowlCount, error } = await query;

      if (error) {
        console.error('Fishbowl count error:', error);
        return;
      }

      setCount(fishbowlCount || 0);
    } catch (error) {
      console.error('Error loading fishbowl count:', error);
      setCount(0);
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) {
      setCount(0);
      return;
    }

    lastSeenRef.current = profile.last_seen_fishbowl_at ?? null;
    loadCount();

    const channel = supabase
      .channel('fishbowl_count_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leads',
        filter: 'is_fishbowl=eq.true',
      }, () => loadCount())
      .subscribe();

    const handleSeen = (e: Event) => {
      const ts = (e as CustomEvent<string>).detail;
      lastSeenRef.current = ts;
      setCount(0);
    };
    window.addEventListener(FISHBOWL_SEEN_EVENT, handleSeen);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener(FISHBOWL_SEEN_EVENT, handleSeen);
    };
  }, [profile, loadCount]);

  return count;
}

export async function markFishbowlSeen(profileId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from('profiles')
    .update({ last_seen_fishbowl_at: now })
    .eq('id', profileId);
  window.dispatchEvent(new CustomEvent(FISHBOWL_SEEN_EVENT, { detail: now }));
}
