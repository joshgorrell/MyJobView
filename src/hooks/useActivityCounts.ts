import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type ActivityArea = 'pipeline_lead' | 'test_tune' | 'feedback' | 'service_request';

export function useActivityCounts() {
  const { profile } = useAuth();
  const [counts, setCounts] = useState<Record<ActivityArea, number>>({
    pipeline_lead: 0, test_tune: 0, feedback: 0, service_request: 0,
  });

  const refresh = useCallback(async () => {
    if (!profile?.id || !profile.organization_id) {
      setCounts({ pipeline_lead: 0, test_tune: 0, feedback: 0, service_request: 0 });
      return;
    }
    const org = profile.organization_id;
    const [reads, baselines, leads, feedback, lostFeedback, service, tune] = await Promise.all([
      supabase.from('activity_notification_reads').select('activity_type,activity_id').eq('user_id', profile.id),
      supabase.from('activity_notification_baselines').select('activity_type,started_at').eq('user_id', profile.id),
      supabase.from('leads').select('id,is_fishbowl,created_at').eq('organization_id', org).eq('assigned_to', profile.id),
      supabase.from('customer_satisfaction').select('id,responded_at').eq('organization_id', org).not('responded_at', 'is', null),
      supabase.from('lost_review_details').select('request_id,response_created_at,responded_at').eq('organization_id', org).not('responded_at', 'is', null),
      supabase.from('service_requests').select('id,created_at').eq('organization_id', org),
      supabase.rpc('get_test_tune_workspace'),
    ]);
    // Never show inflated counts when a query fails (including before migration deployment).
    if ([reads, baselines, leads, feedback, lostFeedback, service, tune].some(result => result.error)) {
      setCounts({ pipeline_lead: 0, test_tune: 0, feedback: 0, service_request: 0 });
      return;
    }
    const seen = new Set((reads.data || []).map(row => `${row.activity_type}:${row.activity_id}`));
    const baseline = new Map((baselines.data || []).map(row => [row.activity_type, row.started_at]));
    const areas: ActivityArea[] = ['pipeline_lead', 'test_tune', 'feedback', 'service_request'];
    const missing = areas.filter(area => !baseline.has(area));
    if (missing.length) {
      const { error } = await supabase.from('activity_notification_baselines').upsert(
        missing.map(activity_type => ({ user_id: profile.id, organization_id: org, activity_type })),
        { onConflict: 'user_id,activity_type', ignoreDuplicates: true },
      );
      if (error) console.error('Activity baseline initialization failed:', error);
      // The baseline is initialized once. Refresh promptly instead of leaving a badge
      // at zero until the next 30-second poll. Never retry recursively on failure.
      if (!error) window.dispatchEvent(new Event('activity:baseline-ready'));
      return;
    }
    const isNew = (area: ActivityArea, timestamp: string | null | undefined) =>
      Boolean(timestamp && Date.parse(timestamp) > Date.parse(baseline.get(area) || ''));
    const count = (area: ActivityArea, ids: string[]) =>
      new Set(ids.filter(id => !seen.has(`${area}:${id}`))).size;
    const customerTasks: string[] = (tune.data || []).flatMap((project: { tasks?: { id: string; source?: string; created_at?: string }[] }) =>
      (project.tasks || []).filter(task => task.source === 'customer' && isNew('test_tune', task.created_at)).map(task => task.id)
    );
    setCounts({
      pipeline_lead: count('pipeline_lead', (leads.data || []).filter(row => !row.is_fishbowl && isNew('pipeline_lead', row.created_at)).map(row => row.id)),
      test_tune: count('test_tune', customerTasks),
      feedback: count('feedback', [
        ...(feedback.data || []).filter(row => isNew('feedback', row.responded_at)).map(row => row.id),
        ...(lostFeedback.data || []).filter(row => isNew('feedback', row.response_created_at || row.responded_at)).map(row => row.request_id),
      ]),
      service_request: count('service_request', (service.data || []).filter(row => isNew('service_request', row.created_at)).map(row => row.id)),
    });
  }, [profile?.id, profile?.organization_id]);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel(`favorite_activity:${profile?.id || 'none'}`);
    for (const table of ['leads', 'customer_satisfaction', 'service_requests', 'project_tasks', 'activity_notification_reads']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => void refresh());
    }
    channel.subscribe();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('activity:seen', onFocus);
    window.addEventListener('activity:baseline-ready', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener('activity:seen', onFocus); window.removeEventListener('activity:baseline-ready', onFocus); void supabase.removeChannel(channel); };
  }, [refresh, profile?.id]);

  return { counts, refresh };
}

export async function markActivitySeen(userId: string, organizationId: string, area: ActivityArea, id: string) {
  const { error } = await supabase.from('activity_notification_reads').upsert({
    user_id: userId, organization_id: organizationId, activity_type: area, activity_id: id,
  }, { onConflict: 'user_id,activity_type,activity_id', ignoreDuplicates: true });
  if (error) throw error;
  window.dispatchEvent(new Event('activity:seen'));
}
