// Legacy Day-7 Test & Tune worker retired by issue #440.
// Activation and optional invitation must be performed by the explicit project
// completion workflow, not by a scheduled job or direct invocation of this route.
// Keep this endpoint as a harmless compatibility stub until all deployments have
// removed their old cron schedule.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200 });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const schedulerKey = Deno.env.get('TEST_TUNE_SCHEDULER_SECRET') || '';
  const auth = req.headers.get('Authorization');
  if (!((serviceKey && auth === `Bearer ${serviceKey}`) || (schedulerKey && auth === `Bearer ${schedulerKey}`))) {
    return new Response('Unauthorized', { status: 401 });
  }
  return Response.json({ processed: 0, results: [], retired: true });
});
