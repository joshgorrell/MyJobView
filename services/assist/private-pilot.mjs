import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createControlServer } from './control-server.mjs';
import { dealerDomain } from './control-core.mjs';
import { createManagedRuntime } from './managed-runtime.mjs';
import { createStateStore } from './state-store.mjs';

export function readPrivatePilotConfig(env) {
  const origin = new URL(env.ASSIST_TEST_ORIGIN);
  const port = Number(env.ASSIST_TEST_PORT);
  const { ASSIST_TEST_VERSION: version, ASSIST_TEST_AGENT_CACHE: cache } = env;
  if (origin.protocol !== 'https:' || origin.origin !== env.ASSIST_TEST_ORIGIN ||
      !origin.hostname.endsWith('.test') || !Number.isInteger(port) || port < 1024 ||
      port > 65535 || !/^\d+\.\d+\.\d+$/.test(version || '') || !cache || !isAbsolute(cache)) {
    throw new Error('invalid_private_pilot_config');
  }
  return { origin: origin.origin, port, version, cache };
}

async function launch() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('interactive_pilot_required');
  const config = readPrivatePilotConfig(process.env);
  const root = await mkdtemp(join(tmpdir(), 'mjv-assist-private-test-'));
  const store = createStateStore(root);
  const organizationId = randomUUID();
  const domain = dealerDomain(organizationId);
  let runtime, server, release, deadline;
  const controller = new AbortController();
  async function stop() {
    clearTimeout(deadline);
    if (server) {
      server.close();
      server.closeAllConnections();
    }
    if (runtime) await runtime.stopAll();
    if (release) await release();
    await rm(root, { recursive: true, force: true });
  }
  const halt = () => controller.abort();
  process.once('SIGINT', halt);
  process.once('SIGTERM', halt);
  deadline = setTimeout(halt, 60 * 60 * 1000);
  try {
    release = await store.lock();
    controller.signal.throwIfAborted();
    runtime = createManagedRuntime({
      store,
      entry: new URL('./node_modules/meshcentral/meshcentral.js', import.meta.url).pathname,
      approvedVersion: config.version,
      publicOrigin: config.origin,
      agentCacheDirectory: config.cache,
      // A disposable runtime starts with fresh certificates and signs its tools.
      startupAttempts: 120,
      onExit: async () => halt(),
    });
    await runtime.verifyVersion();
    // Production reconciliation writes the initial state before allocating a runtime.
    await store.write(organizationId, {
      organization_id: organizationId,
      generation: 1,
      desired_enabled: true,
      phase: 'applying',
    });
    await runtime.ensure({ organization_id: organizationId, generation: 1 },
      async () => controller.signal.throwIfAborted());
    controller.signal.throwIfAborted();
    const guest = await runtime.createGuestGroup(organizationId, randomUUID().replaceAll('-', ''));
    controller.signal.throwIfAborted();
    server = createControlServer({ runtime, pilotDomain: domain });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, '127.0.0.1', resolve);
    });
    controller.signal.throwIfAborted();
    console.log(JSON.stringify({ domain, download: guest.download_url, lifetimeMinutes: 60 }));
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    prompt.on('SIGINT', halt);
    try {
      await prompt.question('After the designated PC connects, press Enter to prepare the viewer. ', { signal: controller.signal });
      const online = (await runtime.inventory(organizationId, guest.meshId)).filter(device => device.online);
      if (online.length !== 1) throw new Error('expected_one_pilot_device');
      controller.signal.throwIfAborted();
      const username = 'mjv-session-' + randomUUID().replaceAll('-', '');
      const viewer = await runtime.createViewer(organizationId, online[0].id, username, guest.meshId);
      controller.signal.throwIfAborted();
      const viewerPath = join(root, 'operator-viewer.txt');
      await writeFile(viewerPath, viewer.viewer_url + '\n', { flag: 'wx', mode: 0o600 });
      controller.signal.throwIfAborted();
      console.log('Operator viewer saved locally at ' + viewerPath);
      await prompt.question('Press Enter to end the pilot and disconnect the test PC. ', { signal: controller.signal });
      await runtime.revokeViewer(organizationId, username);
    } finally {
      prompt.close();
    }
  } finally {
    process.removeListener('SIGINT', halt);
    process.removeListener('SIGTERM', halt);
    await stop();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  launch().catch(() => {
    console.error('Private Assist pilot could not start.');
    process.exitCode = 1;
  });
}
