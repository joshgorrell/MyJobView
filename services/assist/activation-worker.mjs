/** Runs on MJV's trusted support host, never in a browser. Node 22+. */
import { pathToFileURL } from 'node:url';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateJob(job) {
  if (!job || !uuid.test(job.organization_id) || !uuid.test(job.lease_token) ||
      !Number.isSafeInteger(job.generation) || job.generation < 1 ||
      typeof job.desired_enabled !== 'boolean' || !Number.isFinite(Date.parse(job.lease_until))) {
    throw new Error('invalid_job');
  }
  if (Date.parse(job.lease_until) <= Date.now() + 40_000) throw new Error('lease_too_short');
  return job;
}
export function validateProviderResult(job, result) {
  if (!result || result.organization_id !== job.organization_id || result.generation !== job.generation ||
      result.desired_enabled !== job.desired_enabled || result.status !== 'applied' || result.verified !== true) {
    return { status: 'failed', error_code: 'verification_failed' };
  }
  if (!job.desired_enabled) {
    // Provider must attest revocation, including copied enrollment links and active sessions.
    if (result.sessions_revoked !== true || result.enrollment_revoked !== true || result.accounts_disabled !== true) {
      return { status: 'failed', error_code: 'verification_failed' };
    }
    return { status: 'applied', verified: true };
  }
  const domain = result.mesh_domain;
  if (domain !== `mjv-${job.organization_id.replaceAll('-', '')}` || result.consent_enforced !== true ||
      result.isolation_verified !== true || typeof result.server_origin !== 'string') {
    return { status: 'failed', error_code: 'verification_failed' };
  }
  let origin, download;
  try { origin = new URL(result.server_origin); download = new URL(result.windows_download_url); }
  catch { return { status: 'failed', error_code: 'verification_failed' }; }
  if (origin.protocol !== 'https:' || origin.origin !== result.server_origin || origin.username || origin.password ||
      download.origin !== origin.origin || download.username || download.password || download.hash ||
      download.pathname !== `/${domain}/meshagents` || download.searchParams.get('id') !== '4' ||
      !download.searchParams.get('meshid') || [...download.searchParams.keys()].some(k => !['id','meshid'].includes(k)) ||
      download.searchParams.getAll('id').length !== 1 || download.searchParams.getAll('meshid').length !== 1) {
    return { status: 'failed', error_code: 'verification_failed' };
  }
  return { status: 'applied', verified: true, server_origin: origin.origin, mesh_domain: domain, windows_download_url: download.href };
}

export function createActivationWorker({ rpc, reconcile, now = () => Date.now() }) {
  return {
    async runOnce() {
      const job = await rpc('claim_assist_activation', {});
      if (!job) return { outcome: 'idle' };
      let result;
      try {
        validateJob(job);
        if (await rpc('validate_assist_activation_lease', {
          p_organization_id: job.organization_id, p_generation: job.generation, p_lease_token: job.lease_token,
        }) !== true) return { outcome: 'superseded', organizationId: job.organization_id };
        result = validateProviderResult(job, await reconcile(job));
        if (Date.parse(job.lease_until) <= now()) return { outcome: 'expired', organizationId: job.organization_id };
      } catch (error) {
        result = { status: 'failed', error_code: error?.code === 'not_configured' ? 'not_configured' : 'provider_unavailable' };
      }
      const finish = data => rpc('finish_assist_activation', {
        p_organization_id: job.organization_id, p_generation: job.generation, p_lease_token: job.lease_token, p_result: data,
      });
      let applied;
      try { applied = await finish(result); }
      catch {
        // E.g. invalid provider-origin/domain uniqueness: never leave a verified ready row behind.
        result = { status: 'failed', error_code: 'verification_failed' };
        applied = await finish(result);
      }
      return { outcome: applied ? (result.status === 'applied' ? 'applied' : 'retry') : 'superseded', organizationId: job.organization_id };
    },
  };
}

export function createHttpDependencies(env, fetchImpl = fetch) {
  const required = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ASSIST_CONTROL_ORIGIN','ASSIST_CONTROL_TOKEN'];
  if (required.some(k => !env[k])) throw new Error('Assist host configuration is incomplete');
  const database = new URL(env.SUPABASE_URL), control = new URL(env.ASSIST_CONTROL_ORIGIN);
  if (database.protocol !== 'https:' || control.protocol !== 'https:' || database.username || database.password ||
      control.username || control.password || database.origin !== env.SUPABASE_URL || control.origin !== env.ASSIST_CONTROL_ORIGIN) {
    throw new Error('Assist host endpoints must be HTTPS origins');
  }
  async function request(url, body, headers, timeoutMs = 30_000) {
    const response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('Assist host request failed');
    const text = await response.text();
    if (text.length > 32_768) throw new Error('Oversized response');
    return JSON.parse(text);
  }
  return {
    rpc: (name, body) => {
      if (!['claim_assist_activation','finish_assist_activation','validate_assist_activation_lease','requeue_assist_runtime','assist_support_service'].includes(name)) throw new Error('Unexpected RPC');
      return request(`${database.origin}/rest/v1/rpc/${name}`, body,
        { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` });
    },
    reconcile: job => {
      // Cold provisioning runs native setup and the Windows probe before replying.
      // Reserve a full RPC timeout to finish within the database lease.
      const remainingMs = Date.parse(job.lease_until) - Date.now();
      const timeoutMs = Math.min(90_000, remainingMs - 30_000);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('lease_too_short');
      return request(`${control.origin}/v1/dealers/reconcile`, {
        organization_id: job.organization_id, generation: job.generation, desired_enabled: job.desired_enabled,
        mesh_domain: `mjv-${job.organization_id.replaceAll('-', '')}`, lease_token: job.lease_token, lease_until: job.lease_until,
      }, { authorization: `Bearer ${env.ASSIST_CONTROL_TOKEN}`, 'idempotency-key': `${job.organization_id}:${job.generation}` }, timeoutMs);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const worker = createActivationWorker(createHttpDependencies(process.env));
    let stopped = false;
    process.on('SIGTERM', () => { stopped = true; }); process.on('SIGINT', () => { stopped = true; });
    do {
      try { const result = await worker.runOnce(); console.log(JSON.stringify(result)); }
      catch { console.error('Assist activation worker failed; retrying without exposing credentials'); }
      if (process.argv.includes('--once') || stopped) break;
      await new Promise(resolve => setTimeout(resolve, 15_000));
    } while (!stopped);
  } catch { console.error('Assist activation worker requires valid host configuration'); process.exitCode = 1; }
}
