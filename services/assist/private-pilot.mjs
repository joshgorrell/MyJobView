import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
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
  const config = readPrivatePilotConfig(process.env);
  const root = await mkdtemp(join(tmpdir(), 'mjv-assist-private-test-'));
  const store = createStateStore(root);
  const organizationId = randomUUID();
  const domain = dealerDomain(organizationId);
  let runtime, server, release, deadline;
  const controller = new AbortController();
  let shutdown;
  let listening = false;
  const stop = () => shutdown ??= (async () => {
    clearTimeout(deadline);
    if (server) {
      server.close();
      server.closeAllConnections();
    }
    if (runtime) await runtime.stopAll();
    if (release) await release();
    await rm(root, { recursive: true, force: true });
  })();
  const halt = () => {
    controller.abort();
    if (listening) void stop().catch(() => { process.exitCode = 1; });
  };
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
      onExit: async () => halt(),
    });
    await runtime.verifyVersion();
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
    listening = true;
    controller.signal.throwIfAborted();
    console.log(JSON.stringify({ domain, download: guest.download_url, lifetimeMinutes: 60 }));
  } catch (error) {
    await stop();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  launch().catch(() => {
    console.error('Private Assist pilot could not start.');
    process.exitCode = 1;
  });
}
