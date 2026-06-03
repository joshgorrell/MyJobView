import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useNotificationCount(): number {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!profile) {
      setCount(0);
      return;
    }

    const load = async () => {
      try {
        const { count: unread } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .eq('is_read', false);

        setCount(unread || 0);
      } catch {
        setCount(0);
      }
    };

    load();

    const channel = supabase
      .channel(`notif_count:${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  return count;
}
