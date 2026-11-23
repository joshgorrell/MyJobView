/** Windows-side verifier for the private, nonce-bound Assist pilot fixture. */
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { validateCanaryRequest } from './windows-canary-contract.mjs';

const run = promisify(execFile);
const connectScript = fileURLToPath(new URL('../../tests/assist/windows/connect-guest-helper.ps1', import.meta.url));
const maxAgentBytes = 16 * 1024 * 1024;

function originOf(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) {
    throw new Error('invalid_windows_pilot_origin');
  }
  return url.origin;
}

async function readBounded(response, limit) {
  if (!response.ok || !response.body) throw new Error('windows_pilot_request_failed');
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('windows_pilot_response_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function validateDownload(value, request) {
  const url = new URL(value);
  const keys = [...url.searchParams.keys()].sort().join(',');
  if (url.origin !== request.server_origin || url.username || url.password || url.hash ||
      url.pathname !== `/${request.mesh_domain}/meshagents` ||
      keys !== 'id,installflags,meshid' ||
      url.searchParams.get('id') !== '4' || url.searchParams.get('installflags') !== '1' ||
      !/^[A-Za-z0-9@$+=_-]{32,128}$/.test(url.searchParams.get('meshid') || '')) {
    throw new Error('invalid_windows_pilot_download');
  }
  return url;
}

function validateViewer(value, request) {
  const url = new URL(value?.viewer_url);
  const keys = [...url.searchParams.keys()].sort().join(',');
  if (value.viewer_origin !== request.server_origin || url.origin !== request.server_origin ||
      url.username || url.password || url.hash || url.pathname !== `/${request.mesh_domain}/` ||
      keys !== 'hide,login,node,viewmode' || url.searchParams.get('viewmode') !== '11' ||
      url.searchParams.get('hide') !== '15' || !url.searchParams.get('login') || !url.searchParams.get('node')) {
    throw new Error('invalid_windows_pilot_viewer');
  }
  return url.href;
}

export function createLiveWindowsVerifier({
  serverOrigin, fixtureOrigin, token, testDirectory = tmpdir(), certPath,
  transport = fetch,
}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('dedicated_windows_x64_required');
  const server = originOf(serverOrigin);
  const fixture = originOf(fixtureOrigin);
  if (typeof token !== 'string' || token.length < 32) throw new Error('windows_pilot_fixture_token_required');
  return async (payload, { signal = AbortSignal.timeout(45_000) } = {}) => {
    const request = validateCanaryRequest(payload);
    if (request.server_origin !== server) throw new Error('unconfigured_windows_pilot_origin');
    const fields = { organization_id: request.organization_id, generation: request.generation, probe_nonce: request.probe_nonce };
    const ask = async operation => {
      const response = await transport(fixture + '/v1/assist/fixture', {
        method: 'POST', redirect: 'error', signal,
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ ...fields, operation }),
      });
      return JSON.parse((await readBounded(response, 8192)).toString('utf8'));
    };
    const workDirectory = await realpath(testDirectory);
    const root = await mkdtemp(join(workDirectory, 'mjv-assist-probe-'));
    const executable = join(root, 'temporary-assist.exe');
    let agent, exited, evidence;
    try {
      const download = validateDownload((await ask('download')).download_url, request);
      const bytes = await readBounded(await transport(download.href, { redirect: 'error', signal }), maxAgentBytes);
      if (bytes.toString('ascii', 0, 2) !== 'MZ') throw new Error('windows_pilot_helper_invalid');
      await writeFile(executable, bytes, { flag: 'wx' });
      signal.throwIfAborted();
      agent = spawn(executable, [], { cwd: workDirectory, stdio: 'ignore' });
      exited = new Promise(resolve => { agent.once('error', resolve); agent.once('exit', resolve); });
      await once(agent, 'spawn');
      await run('pwsh', ['-NoProfile', '-File', connectScript, '-AgentPid', String(agent.pid)], { signal, timeout: 18_000 });
      let viewer;
      while (!viewer) {
        signal.throwIfAborted();
        if (agent.exitCode !== null) throw new Error('windows_pilot_helper_exited');
        const result = await ask('viewer');
        if (result.status === 'ready') viewer = validateViewer(result, request);
        else if (result.status !== 'waiting') throw new Error('windows_pilot_viewer_unavailable');
        else await delay(400, undefined, { signal });
      }
      const { exerciseDesktopSession } = await import('../../tests/assist/windows/desktop-session.mjs');
      await exerciseDesktopSession({ viewerUrl: viewer, executable, certPath, root, signal });
      if ((await ask('isolation')).denied !== true) throw new Error('windows_pilot_isolation_not_observed');
      evidence = {
        ...fields, mesh_domain: request.mesh_domain, checked_at: Date.now(),
        desktop_control: true, consent_enforced: true, cross_tenant_denied: true,
        windows_host_verified: true, actual_input_observed: true, denied_consent_observed: true,
        second_dealer_denied_observed: true,
      };
    } finally {
      try {
        if (agent?.pid) {
          // The Connect button launches a second instance of the same executable.
          // Wait for all instances of this exact helper before deleting its files.
          await run('pwsh', ['-NoProfile', '-Command',
            '$guests = Get-Process -Name temporary-assist -ErrorAction SilentlyContinue | Where-Object Path -eq $env:ASSIST_TEST_GUEST_EXE; ' +
            'foreach ($guest in $guests) { if (-not $guest.HasExited) { $guest.Kill(); if (-not $guest.WaitForExit(3000)) { throw "Temporary helper did not exit" } } }'],
          { env: { ...process.env, ASSIST_TEST_GUEST_EXE: executable }, timeout: 8_000 });
        }
      } finally {
        if (agent?.pid && agent.exitCode === null && agent.signalCode === null) agent.kill();
        if (exited) await exited;
        await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
      }
    }
    signal.throwIfAborted();
    return evidence;
  };
}

export async function verify(request, options) {
  const env = process.env;
  if (!env.ASSIST_WINDOWS_CANARY_DEVICE ||
      hostname().toLowerCase() !== env.ASSIST_WINDOWS_CANARY_DEVICE.toLowerCase() ||
      env.ASSIST_CANARY_FIXTURE_TOKEN === env.ASSIST_CANARY_TOKEN) {
    throw new Error('dedicated_windows_canary_configuration_required');
  }
  return createLiveWindowsVerifier({
    serverOrigin: env.ASSIST_WINDOWS_CANARY_SERVER_ORIGIN,
    fixtureOrigin: env.ASSIST_WINDOWS_CANARY_FIXTURE_ORIGIN,
    token: env.ASSIST_CANARY_FIXTURE_TOKEN,
  })(request, options);
}
