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
    if (!profile?.id || !profile.organization_id) return;
    const org = profile.organization_id;
    const [reads, leads, feedback, service, tune] = await Promise.all([
      supabase.from('activity_notification_reads').select('activity_type,activity_id').eq('user_id', profile.id),
      supabase.from('leads').select('id,is_fishbowl').eq('organization_id', org).eq('assigned_to', profile.id),
      supabase.from('customer_satisfaction').select('id').eq('organization_id', org).not('responded_at', 'is', null),
      supabase.from('service_requests').select('id').eq('organization_id', org),
      supabase.rpc('get_test_tune_workspace'),
    ]);
    // Never show inflated counts when a query fails (including before migration deployment).
    if ([reads, leads, feedback, service, tune].some(result => result.error)) return;
    const seen = new Set((reads.data || []).map(row => `${row.activity_type}:${row.activity_id}`));
    const count = (area: ActivityArea, ids: string[]) => ids.filter(id => !seen.has(`${area}:${id}`)).length;
    const customerTasks: string[] = (tune.data || []).flatMap((project: { tasks?: { id: string; source?: string }[] }) =>
      (project.tasks || []).filter(task => task.source === 'customer').map(task => task.id)
    );
    setCounts({
      pipeline_lead: count('pipeline_lead', (leads.data || []).filter(row => !row.is_fishbowl).map(row => row.id)),
      test_tune: count('test_tune', customerTasks),
      feedback: count('feedback', (feedback.data || []).map(row => row.id)),
      service_request: count('service_request', (service.data || []).map(row => row.id)),
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
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener('activity:seen', onFocus); void supabase.removeChannel(channel); };
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
