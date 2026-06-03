import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const NO_CONTACT_UPDATED_EVENT = 'contact_log:updated';

export function useNoContactCount(): number {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);

  const loadCount = async () => {
    if (!profile) {
      setCount(0);
      return;
    }

    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: loggedIds, error: logError } = await supabase
        .from('customer_contact_log')
        .select('service_request_id')
        .not('service_request_id', 'is', null);

      if (logError) {
        console.error('No-contact count log fetch error:', logError);
        return;
      }

      const contactedServiceRequestIds = (loggedIds || [])
        .map((r: { service_request_id: string }) => r.service_request_id)
        .filter(Boolean) as string[];

      let query = supabase
        .from('service_requests')
        .select('*', { count: 'exact', head: true })
        .not('status', 'in', '("completed","cancelled","closed")')
        .lt('created_at', cutoff);

      if (contactedServiceRequestIds.length > 0) {
        query = query.not('id', 'in', `(${contactedServiceRequestIds.map(id => `"${id}"`).join(',')})`);
      }

      const { count: srCount, error: srError } = await query;

      if (srError) {
        console.error('No-contact count service requests error:', srError);
        return;
      }

      setCount(srCount || 0);
    } catch (error) {
      console.error('Error loading no-contact count:', error);
      setCount(0);
    }
  };

  useEffect(() => {
    if (!profile) {
      setCount(0);
      return;
    }

    loadCount();

    const channel = supabase
      .channel(`no_contact_count_changes:${Math.random()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'service_requests',
      }, loadCount)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'customer_contact_log',
      }, loadCount)
      .subscribe();

    const handleUpdate = () => loadCount();
    window.addEventListener(NO_CONTACT_UPDATED_EVENT, handleUpdate);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener(NO_CONTACT_UPDATED_EVENT, handleUpdate);
    };
  }, [profile]);

  return count;
}
