import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const PUNCHLIST_SEEN_EVENT = 'punchlist:seen';


export function usePunchlistUnseenCount(): number {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);
  const lastSeenRef = useRef<string | null>(profile?.last_seen_punchlist_at ?? null);

  const loadCount = useCallback(async () => {
    if (!profile) {
      setCount(0);
      return;
    }

    try {
      const { data: unseenCount, error } = await supabase.rpc('get_punchlist_unseen_count', { p_after: lastSeenRef.current });

      if (error) {
        console.error('Punchlist unseen count error:', error);
        return;
      }

      setCount(unseenCount || 0);
    } catch (error) {
      console.error('Error loading punchlist unseen count:', error);
      setCount(0);
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) {
      setCount(0);
      return;
    }

    lastSeenRef.current = profile.last_seen_punchlist_at ?? null;
    loadCount();

    const channel = supabase
      .channel('punchlist_unseen_count_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'punchlist_tasks',
      }, () => loadCount())
      .on('postgres_changes', {event:'*',schema:'public',table:'project_tasks'}, () => loadCount())
      .subscribe();

    const handleSeen = (e: Event) => {
      const ts = (e as CustomEvent<string>).detail;
      lastSeenRef.current = ts;
      setCount(0);
    };
    window.addEventListener(PUNCHLIST_SEEN_EVENT, handleSeen);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener(PUNCHLIST_SEEN_EVENT, handleSeen);
    };
  }, [profile, loadCount]);

  return count;
}

export async function markPunchlistSeen(profileId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from('profiles')
    .update({ last_seen_punchlist_at: now })
    .eq('id', profileId);
  window.dispatchEvent(new CustomEvent(PUNCHLIST_SEEN_EVENT, { detail: now }));
}
