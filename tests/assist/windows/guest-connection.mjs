// Exercises the real temporary guest agent on an ephemeral Windows runner.
// This test never issues activation evidence or uses a production endpoint.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { createServer } from 'node:tls';
import { fileURLToPath } from 'node:url';

import { createControlServer } from '../../../services/assist/control-server.mjs';
import { dealerDomain } from '../../../services/assist/control-core.mjs';
import { createManagedRuntime } from '../../../services/assist/managed-runtime.mjs';
import { stageAgentCache } from '../../../services/assist/prepare-agent-cache.mjs';
import { createLiveWindowsVerifier } from '../../../services/assist/windows-live-verifier.mjs';
import { createWindowsCanaryServer } from '../../../services/assist/windows-canary-host.mjs';
import { createWindowsCanaryFixture } from '../../../services/assist/windows-canary-fixture.mjs';
import { createStateStore } from '../../../services/assist/state-store.mjs';

const loopback = '127.0.0.1';
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

function fetchLocal(url, ca, options = {}) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, { ca, signal: AbortSignal.timeout(10_000), ...options }, async response => {
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of response) {
          size += chunk.length;
          assert.ok(size <= 16 * 1024 * 1024, 'Native response exceeded the test limit');
          chunks.push(chunk);
        }
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode }));
      } catch (error) { reject(error); }
    });
    request.once('error', reject);
    request.end(options.body);
  });
}

if (process.platform !== 'win32' || process.arch !== 'x64' || process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.env.GITHUB_REPOSITORY !== 'joshgorrell/MyJobView') {
  throw new Error('This test is restricted to disposable GitHub-hosted MyJobView Windows x64 runners');
}

const root = await mkdtemp(join(process.env.RUNNER_TEMP, 'mjv-windows-guest-'));
const store = createStateStore(join(root, 'runtime'));
const organizationId = randomUUID();
const domain = dealerDomain(organizationId);
const fixtureToken = randomUUID() + randomUUID();
const canaryToken = randomUUID() + randomUUID();
const isolationOrganizationId = randomUUID();
const proxySockets = new Set();
let runtime, backend, proxy, canaryServer;
let testFailed = false;
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
  const provisioned = await runtime.ensure({ organization_id: organizationId, generation: 1 }, async () => {});
  await store.write(isolationOrganizationId, { organization_id: isolationOrganizationId, generation: 1, desired_enabled: true, phase: 'applying' });
  await runtime.ensure({ organization_id: isolationOrganizationId, generation: 1 }, async () => {});

  let download;
  const verifier = createLiveWindowsVerifier({
    serverOrigin: origin, fixtureOrigin: origin, token: fixtureToken, testDirectory: root, certPath,
    transport: async (url, options) => {
      const response = await fetchLocal(url, cert, options);
      if (url.endsWith('/v1/assist/fixture') && JSON.parse(options.body).operation === 'download' && response.ok) {
        download = (await response.clone().json()).download_url;
      }
      return response;
    },
  });
  canaryServer = createWindowsCanaryServer({
    token: canaryToken, verifyTimeoutMs: 45_000,
    verify: async (request, options) => {
      try { return await verifier(request, options); }
      catch (error) { console.error('Windows test verifier failed:', error.message); throw error; }
    },
  });
  const canaryPort = await listen(canaryServer);
  const fixture = createWindowsCanaryFixture({
    runtime, organizationId, isolationOrganizationId, probe: async request => {
      const result = await fetch(`http://${loopback}:${canaryPort}/v1/assist/probe`, {
        method: 'POST', headers: { authorization: 'Bearer ' + canaryToken, 'content-type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(50_000),
      });
      assert.equal(result.status, 200, 'Windows canary verification failed');
      return result.json();
    },
  });
  backend = createControlServer({ runtime, pilotDomain: domain, canaryFixture: fixture, canaryFixtureToken: fixtureToken });
  backendPort = await listen(backend);
  const probeRequest = {
    organization_id: organizationId, generation: 1, mesh_domain: domain, mesh_id: provisioned.meshId,
    server_origin: origin, probe_nonce: randomUUID(), probe_requested_at: Date.now(),
  };
  stage = 'exercise the Windows verifier over its private HTTP interface';
  const evidence = await fixture.probe(probeRequest);
  assert.equal(evidence.probe_nonce, probeRequest.probe_nonce);
  assert.equal(evidence.desktop_control, true);
  assert.equal(evidence.consent_enforced, true);
  assert.equal(evidence.cross_tenant_denied, true);
  assert.deepEqual(await runtime.inventory(organizationId), [], 'A guest must not appear as a permanently enrolled device');

  stage = 'check revoked temporary Windows access';
  const stale = await fetchLocal(download, cert);
  assert.equal(stale.status, 404, 'The old guest download must return HTTP 404');
  const guestMeshId = `mesh/${domain}/${new URL(download).searchParams.get('meshid')}`;
  assert.deepEqual(await runtime.inventory(organizationId, guestMeshId), []);
  console.log('Windows verifier passed real screen/input, consent and dealer isolation. The temporary guest was revoked.');
  console.log('The returned proof is scoped to this disposable CI fixture.');
} catch (error) {
  testFailed = true;
  console.error(`Windows guest connection failed at: ${stage}`);
  throw error;
} finally {
  if (canaryServer?.listening) {
    canaryServer.close();
    canaryServer.closeAllConnections();
  }
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
