import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FlowEvent, FlowFilters } from './types';

const PAGE_SIZE = 50;
export function useFlow(filters: FlowFilters) {
  const { profile } = useAuth();
  const [events, setEvents] = useState<FlowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);
  const [connected, setConnected] = useState(false);
  const generation = useRef(0);
  const readRevision = useRef(0);
  const eventsRef = useRef(events); eventsRef.current = events;
  const filterKey = JSON.stringify(filters);
  const filterRef = useRef(filters); filterRef.current = filters;
  const channelId = useRef(crypto.randomUUID());
  const userId = profile?.id;
  const organizationId = profile?.organization_id;

  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setError(''); setPending(0);
    try {
      const { data, error: failure } = await supabase.rpc('get_flow_events', { p_filters: filterRef.current, p_limit: PAGE_SIZE });
      if (failure) throw failure;
      if (version !== generation.current) return;
      setEvents((data || []) as FlowEvent[]); setHasMore((data || []).length === PAGE_SIZE);
    } catch (failure) {
      if (version === generation.current) setError(failure instanceof Error ? failure.message : 'Flow could not load. Please retry.');
    } finally { if (version === generation.current) setLoading(false); }
  }, []);

  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    setEvents([]); setHasMore(false);
    if (userId) void refresh();
    return invalidate;
  }, [filterKey, userId, refresh, invalidate]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !events.length) return;
    const version = generation.current;
    setLoadingMore(true);
    try {
      const { data, error: failure } = await supabase.rpc('get_flow_events', {
        p_filters: filterRef.current, p_before: events[events.length - 1].id, p_limit: PAGE_SIZE,
      });
      if (failure) throw failure;
      if (version !== generation.current) return;
      setEvents(previous => [...previous, ...(data || []).filter((e: FlowEvent) => !previous.some(p => p.id === e.id))]);
      setHasMore((data || []).length === PAGE_SIZE);
    } catch { if (version === generation.current) setError('Older activity could not load. Please retry.'); }
    finally { setLoadingMore(false); }
  };

  useEffect(() => {
    if (!userId || !organizationId) return;
    let disposed = false;
    let checkRunning = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (disposed || checkRunning || document.hidden) return;
      const version = generation.current;
      const readsAtStart = readRevision.current;
      checkRunning = true;
      try {
        const current = eventsRef.current;
        const { data, error: failure } = await supabase.rpc('get_flow_events', { p_filters: filterRef.current, p_limit: PAGE_SIZE });
        if (failure) throw failure;
        if (disposed || version !== generation.current) return;
        const newest = (data || []) as FlowEvent[];
        // Do not reorder a list someone is reading. Polling also catches missed realtime messages.
        const topId = current[0]?.id || 0;
        setPending(newest.filter(e => e.id > topId).length);
        if (current.length) {
          const { data: views, error: viewError } = await supabase.from('flow_event_views').select('event_id').eq('user_id', userId).in('event_id', current.map(e => e.id));
          if (viewError) throw viewError;
          if (disposed || version !== generation.current || readsAtStart !== readRevision.current) return;
          const viewed = new Set((views || []).map(v => v.event_id));
          setEvents(previous => previous.map(e => ({ ...e, viewed: viewed.has(e.id) })));
        }
      } catch { /* Keep the last usable list; the refresh action surfaces query failures. */ }
      finally { checkRunning = false; }
    };
    const queueCheck = () => { clearTimeout(timer); timer = setTimeout(() => void check(), 300); };
    const channel = supabase.channel(`flow:${channelId.current}:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flow_events', filter: `organization_id=eq.${organizationId}` }, queueCheck)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flow_event_views', filter: `user_id=eq.${userId}` }, queueCheck)
      .subscribe(status => { if (!disposed) { setConnected(status === 'SUBSCRIBED'); if (status === 'SUBSCRIBED') queueCheck(); } });
    const interval = setInterval(() => void check(), 30000);
    document.addEventListener('visibilitychange', queueCheck);
    window.addEventListener('flow-views-changed', queueCheck);
    return () => {
      disposed = true; clearInterval(interval); clearTimeout(timer);
      document.removeEventListener('visibilitychange', queueCheck); window.removeEventListener('flow-views-changed', queueCheck);
      void supabase.removeChannel(channel);
    };
  }, [userId, organizationId, filterKey]);

  const markViewed = async (ids: number[], viewed = true) => {
    if (!userId || !ids.length) return;
    const version = generation.current;
    readRevision.current++;
    try {
      const result = viewed
        ? await supabase.from('flow_event_views').upsert(ids.map(id => ({ event_id: id, user_id: userId })), { onConflict: 'user_id,event_id', ignoreDuplicates: true })
        : await supabase.from('flow_event_views').delete().eq('user_id', userId).in('event_id', ids);
      if (result.error) throw result.error;
      if (version === generation.current) setEvents(previous => previous.map(e => ids.includes(e.id) ? { ...e, viewed } : e));
      window.dispatchEvent(new Event('flow-views-changed'));
    } catch { setError('Viewed status could not be saved. Please try again.'); }
  };
  return { events, loading, loadingMore, hasMore, error, pending, connected, refresh, loadMore, markViewed };
}
