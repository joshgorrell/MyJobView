import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('supabase/functions/force-logout-all-users/index.ts', 'utf8');
assert.ok(source.includes("const expected = Deno.env.get('SESSION_LOGOUT_CRON_SECRET')"),
  'Scheduled global logout must require a server-held secret');
assert.ok(source.includes("req.headers.get('x-session-logout-secret')"),
  'Scheduled global logout must check the supplied secret');
assert.ok(source.includes("manualOrgId = profile.organization_id"),
  'Manual logout must be scoped to the authenticated administrator organization');
assert.ok(source.includes("sessionsQuery.eq('organization_id', manualOrgId)"),
  'Manual logout must only fetch sessions in the caller organization');
assert.ok(source.includes("closeQuery.eq('organization_id', manualOrgId)"),
  'Manual logout must only close sessions in the caller organization');
assert.ok(source.includes("if (isScheduled) {\n      await supabase.rpc('record_scheduled_logout_run'"),
  'Manual logout must not falsely record a scheduled logout');
console.log('Manual force-logout is organization scoped; scheduled global logout requires a secret');
