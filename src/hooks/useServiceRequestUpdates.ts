import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Realtime for normal delivery, polling/focus recovery for missed messages.
// Keep callbacks fresh without reconnecting whenever a component renders.
export function useServiceRequestUpdates(organizationId: string | undefined, refresh: () => void) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!organizationId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (!disposed && !document.hidden) refreshRef.current();
    };
    const queue = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 250);
    };
    const channel = supabase.channel(`service-request-updates:${crypto.randomUUID()}`);
    for (const table of ['service_requests', 'customer_contact_log', 'work_orders']) {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table, filter: `organization_id=eq.${organizationId}`,
      }, queue);
    }
    channel.subscribe(status => { if (status === 'SUBSCRIBED') queue(); });
    const interval = setInterval(update, 15000);
    document.addEventListener('visibilitychange', queue);
    window.addEventListener('focus', queue);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', queue);
      window.removeEventListener('focus', queue);
      void supabase.removeChannel(channel);
    };
  }, [organizationId]);
}
