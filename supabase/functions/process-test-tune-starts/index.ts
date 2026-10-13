import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200 });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const schedulerKey = Deno.env.get('TEST_TUNE_SCHEDULER_SECRET') || '';
  const auth = req.headers.get('Authorization');
  if (!((serviceKey && auth === `Bearer ${serviceKey}`) || (schedulerKey && auth === `Bearer ${schedulerKey}`))) return new Response('Unauthorized', { status: 401 });
  const url = Deno.env.get('SUPABASE_URL') || '';
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  try {
    const { data: invites, error } = await db.rpc('prepare_due_test_tune_invites');
    if (error) throw error;
    const results = [];
    for (const invite of invites || []) {
      try {
        const response = await fetch(`${url}/functions/v1/send-punchlist-invite`, {
          method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...invite, access_type: 'test_and_tune', delivery_key: `test-tune-${invite.project_id}` }),
        });
        const sent = await response.json();
        if (!response.ok || sent.success !== true) throw new Error(sent.error || 'Invitation was not accepted');
        const { error: updateError } = await db.from('projects').update({ test_tune_invite_sent_at: new Date().toISOString() })
          .eq('id', invite.project_id).eq('organization_id', invite.organization_id).is('test_tune_invite_sent_at', null);
        if (updateError) throw updateError;
        results.push({ project_id: invite.project_id, status: 'sent' });
      } catch (error) {
        results.push({ project_id: invite.project_id, status: 'retry_needed', error: error instanceof Error ? error.message : String(error) });
      }
    }
    return Response.json({ processed: results.length, results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
