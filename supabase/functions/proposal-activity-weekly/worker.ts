import { prepareReportEmail, type WeeklyReport } from './reportEmail.ts';
// Dependency injection keeps permission/retry behavior testable without sending real email.
export async function handleWeeklyActivity(req: Request, db: any, send: (init: RequestInit) => Promise<Response>) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const authorization = req.headers.get('Authorization') || '';
  const secret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (secret.length < 32 || secret.length > 256) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const authorized = await db.rpc('security_billing_worker_authorized', { p_secret: secret });
  if (authorized.error || authorized.data !== true) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const rpc = async (action: string, report?: WeeklyReport, payload: Record<string, unknown> = {}) => {
    const result = await db.rpc('proposal_activity_weekly_worker', { p_action: action, p_id: report?.id || null, p_lease: report?.lease_token || null, p_payload: payload });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };
  let processed = 0; let sent = 0; let failed = 0; const started = Date.now();
  try {
    await rpc('generate');
    while (processed < 20 && Date.now() - started < 45_000) {
      const report = await rpc('claim') as WeeklyReport | null;
      if (!report) break;
      processed++;
      try {
        let payload = report.email_payload;
        if (!payload) {
          const [settings, org] = await Promise.all([
            db.from('company_settings').select('from_email,from_name,company_name,company_email,reply_to_email,app_url').eq('organization_id', report.organization_id).single(),
            db.from('organizations').select('subdomain').eq('id', report.organization_id).single(),
          ]);
          if (settings.error || org.error || !settings.data || !org.data) throw new Error('Report company settings could not be loaded');
          payload = await rpc('store_payload', report, prepareReportEmail(report, settings.data, org.data.subdomain));
        }
        const response = await send({ headers: { 'Idempotency-Key': `proposal-activity-weekly-${report.id}` }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`Report email provider failed (${response.status})`);
        await rpc('sent', report); sent++;
      } catch (error) {
        failed++;
        await rpc('failed', report, { error: error instanceof Error ? error.message : 'Report delivery failed' });
      }
    }
    return Response.json({ processed, sent, failed });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Report worker failed', processed, sent, failed }, { status: 500 });
  }
}
