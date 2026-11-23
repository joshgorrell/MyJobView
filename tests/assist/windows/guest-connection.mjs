// Exercises the real temporary guest agent on an ephemeral Windows runner.
// This test never issues activation evidence or uses a production endpoint.
import assert from 'node:assert/strict';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:https';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { createServer } from 'node:tls';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createControlServer } from '../../../services/assist/control-server.mjs';
import { dealerDomain } from '../../../services/assist/control-core.mjs';
import { createManagedRuntime } from '../../../services/assist/managed-runtime.mjs';
import { stageAgentCache } from '../../../services/assist/prepare-agent-cache.mjs';
import { exerciseDesktopSession } from './desktop-session.mjs';
import { createStateStore } from '../../../services/assist/state-store.mjs';

const loopback = '127.0.0.1';
const run = promisify(execFile);
const connectScript = fileURLToPath(new URL('./connect-guest-helper.ps1', import.meta.url));
const entry = fileURLToPath(new URL('../../../services/assist/node_modules/meshcentral/meshcentral.js', import.meta.url));

async function stageWindowsAgent(root, store, organizationId, version) {
  const { schemaVersion, releases } = JSON.parse(await readFile(join(dirname(entry), 'agents', 'agent-defaults.json'), 'utf8'));
  const filename = 'MeshService64.exe';
  const release = releases.find(row => row.repository === 'Ylianst/MeshAgent' &&
    row.files.some(file => file.filename === filename));
  assert.ok(release && /^[a-zA-Z0-9_.-]+$/.test(release.tag), 'Missing pinned Windows x64 release');
  const asset = release.files.find(file => file.filename === filename);
  const response = await fetch(`https://github.com/Ylianst/MeshAgent/releases/download/${release.tag}/${filename}`, {
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(response.status, 200, 'Could not download pinned Windows x64 asset');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, asset.size, 'Unexpected Windows agent size');
  assert.equal(createHash('sha384').update(bytes).digest('hex'), asset.sha384, 'Windows agent hash mismatch');
  const source = join(root, 'download');
  await mkdir(source);
  await writeFile(join(source, filename), bytes);
  const destination = join(store.root, 'instances', organizationId, 'agentbuilds');
  await stageAgentCache({
    manifest: { schemaVersion, releases: [{ ...release, files: [asset] }] },
    source, destination, runtimeVersion: version,
  });
}

async function listen(server, port = 0) {
  server.listen(port, loopback);
  await once(server, 'listening');
  return server.address().port;
}

function fetchLocal(url, ca) {
  return new Promise((resolve, reject) => {
    const request = get(url, { ca, signal: AbortSignal.timeout(10_000) }, async response => {
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of response) {
          size += chunk.length;
          assert.ok(size <= 16 * 1024 * 1024, 'Native response exceeded the test limit');
          chunks.push(chunk);
        }
        resolve({ status: response.statusCode, bytes: Buffer.concat(chunks) });
      } catch (error) { reject(error); }
    });
    request.once('error', reject);
  });
}

async function waitForGuest(runtime, organizationId, groupId, agent) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    assert.equal(agent.exitCode, null, 'The temporary Windows agent exited before connecting');
    const devices = await runtime.inventory(organizationId, groupId);
    const online = devices.filter(device => device.online);
    assert.ok(online.length < 2, 'More than one guest came online');
    if (online.length) return online[0];
    await delay(500);
  }
  throw new Error('The Windows agent did not appear in the temporary guest group');
}

if (process.platform !== 'win32' || process.arch !== 'x64' || process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.env.GITHUB_REPOSITORY !== 'joshgorrell/MyJobView') {
  throw new Error('This test is restricted to disposable GitHub-hosted MyJobView Windows x64 runners');
}

const root = await mkdtemp(join(process.env.RUNNER_TEMP, 'mjv-windows-guest-'));
const store = createStateStore(join(root, 'runtime'));
const organizationId = randomUUID();
const domain = dealerDomain(organizationId);
const proxySockets = new Set();
let runtime, backend, proxy, agent, agentExit;
let testFailed = false;
const executable = join(root, 'temporary-assist.exe');
let stage = 'prepare isolated runtime';
try {
  const version = JSON.parse(await readFile(join(dirname(entry), 'package.json'), 'utf8')).version;
  await stageWindowsAgent(root, store, organizationId, version);
  const certPath = join(root, 'tls.pem');
  const keyPath = join(root, 'tls-key.pem');
  execFileSync(process.env.ASSIST_TEST_OPENSSL || 'openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', keyPath, '-out', certPath,
  ], { stdio: 'ignore' });
  const cert = await readFile(certPath);
  assert.ok(new X509Certificate(cert).checkIP(loopback));
  // Keep TLS and plain HTTP on separate sockets, as on the hosted Assist service.
  let backendPort;
  proxy = createServer({ cert, key: await readFile(keyPath) }, socket => {
    if (!backendPort) return socket.end();
    proxySockets.add(socket);
    const upstream = connect(backendPort, loopback);
    socket.pipe(upstream).pipe(socket);
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => { proxySockets.delete(socket); upstream.destroy(); });
    upstream.on('close', () => socket.destroy());
  });
  const port = await listen(proxy);
  const origin = `https://${loopback}:${port}`;
  await store.write(organizationId, { organization_id: organizationId, generation: 1, desired_enabled: true, phase: 'applying' });
  runtime = createManagedRuntime({
    store, entry, approvedVersion: version, publicOrigin: origin,
    proxyCertificateUrl: origin,
  });
  await runtime.verifyVersion();
  await runtime.ensure({ organization_id: organizationId, generation: 1 }, async () => {});
  backend = createControlServer({ runtime, pilotDomain: domain });
  backendPort = await listen(backend);

  stage = 'download temporary Windows helper';
  const guest = await runtime.createGuestGroup(organizationId, randomUUID().replaceAll('-', ''));
  const download = new URL(guest.download_url);
  assert.equal(download.origin, origin);
  assert.equal(download.searchParams.get('id'), '4');
  assert.equal(download.searchParams.get('installflags'), '1');
  const { status, bytes } = await fetchLocal(download, cert);
  assert.equal(status, 200);
  assert.equal(bytes.toString('ascii', 0, 2), 'MZ');
  await writeFile(executable, bytes, { flag: 'wx' });

  stage = 'connect temporary Windows helper';
  agent = spawn(executable, [], { cwd: root, stdio: 'ignore' });
  agentExit = new Promise(resolve => {
    agent.once('exit', resolve);
    agent.once('error', resolve);
  });
  await once(agent, 'spawn');
  await run('pwsh', ['-NoProfile', '-File', connectScript, '-AgentPid', String(agent.pid)], { timeout: 25_000 });
  const device = await waitForGuest(runtime, organizationId, guest.meshId, agent);
  assert.ok(device.id.startsWith(`node/${domain}/`));
  assert.deepEqual(await runtime.inventory(organizationId), [], 'A guest must not appear as a permanently enrolled device');

  stage = 'reject viewer authorization from a second dealer';
  const otherDealer = randomUUID();
  await store.write(otherDealer, { organization_id: otherDealer, generation: 1, desired_enabled: true, phase: 'applying' });
  await runtime.ensure({ organization_id: otherDealer, generation: 1 }, async () => {});
  try {
    assert.deepEqual(await runtime.inventory(otherDealer), []);
    await assert.rejects(runtime.createViewer(otherDealer, device.id, 'mjv-session-' + randomUUID().replaceAll('-', '')),
      /device_offline/);
  } finally {
    await runtime.stop(otherDealer);
  }

  stage = 'authorize the viewer for the temporary Windows PC';
  const username = 'mjv-session-' + randomUUID().replaceAll('-', '');
  const viewer = await runtime.createViewer(organizationId, device.id, username, guest.meshId);
  assert.equal(viewer.viewer_origin, origin);
  await exerciseDesktopSession({ viewerUrl: viewer.viewer_url, executable, certPath, root });
  await runtime.revokeViewer(organizationId, username);

  stage = 'revoke temporary Windows access';
  await runtime.deleteGuestGroup(organizationId, guest.meshId);
  const stale = await fetchLocal(download, cert);
  assert.equal(stale.status, 404, 'The old guest download must return HTTP 404');
  assert.deepEqual(await runtime.inventory(organizationId, guest.meshId), []);
  console.log('Real Windows guest helper connected through HTTPS, stayed out of permanent enrollment, and its group was revoked.');
  console.log('Real Windows guest denied one desktop request and then approved screen, mouse and keyboard access. No activation evidence was issued.');
} catch (error) {
  testFailed = true;
  console.error(`Windows guest connection failed at: ${stage}`);
  throw error;
} finally {
  if (agent?.pid) {
    // The interactive helper starts a second process using the same executable.
    // Both are owned by this test and can hold the temporary directory open.
    await run('pwsh', ['-NoProfile', '-Command',
      "Get-Process -Name temporary-assist -ErrorAction SilentlyContinue | Where-Object Path -eq $env:ASSIST_TEST_GUEST_EXE | Stop-Process -Force -ErrorAction SilentlyContinue"],
      { env: { ...process.env, ASSIST_TEST_GUEST_EXE: executable }, timeout: 10_000 }).catch(() => {});
    if (agent.exitCode === null && agent.signalCode === null) agent.kill();
  }
  if (agentExit) await agentExit;
  for (const socket of proxySockets) socket.destroy();
  if (proxy?.listening) proxy.close();
  if (backend?.listening) {
    backend.close();
    backend.closeAllConnections();
  }
  try { await runtime?.stopAll(); }
  finally {
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }).catch(error => {
      if (!testFailed) throw error;
      console.error('Windows reported a temporary directory cleanup error:', error.code);
    });
  }
}
