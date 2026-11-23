import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createControlServer } from '../../services/assist/control-server.mjs';
import { dealerDomain } from '../../services/assist/control-core.mjs';
import { createWindowsCanaryFixture } from '../../services/assist/windows-canary-fixture.mjs';

const organizationId = randomUUID();
const domain = dealerDomain(organizationId);
const token = 'f'.repeat(48);
const request = { organization_id: organizationId, generation: 1, probe_nonce: randomUUID(), mesh_domain: domain };
const meshId = 'mesh/' + domain + '/guest';
let devices = [];
let calls = [];
let exercise;
const runtime = {
  async createGuestGroup(id, suffix) {
    calls.push('create');
    assert.equal(id, organizationId);
    assert.equal(suffix, request.probe_nonce.replaceAll('-', ''));
    return { meshId, download_url: 'https://pilot.example.test/' + domain + '/meshagents' };
  },
  async inventory(id, group) {
    assert.equal(id, organizationId);
    assert.equal(group, meshId);
    return devices;
  },
  async createViewer(id, nodeId, username, group) {
    assert.equal(id, organizationId);
    assert.equal(nodeId, devices[0].id);
    assert.equal(group, meshId);
    assert.equal(username, 'mjv-session-' + request.probe_nonce.replaceAll('-', ''));
    calls.push('viewer');
    return { viewer_url: 'https://pilot.example.test/' + domain + '/?login=test' };
  },
  async revokeViewer() { calls.push('revoke'); },
  async deleteGuestGroup() { calls.push('delete'); },
};
const fixture = createWindowsCanaryFixture({ runtime, organizationId, probe: r => exercise(r) });
assert.throws(() => createControlServer({ token, runtime, canaryFixture: fixture, canaryFixtureToken: token }),
  /invalid_canary_fixture_configuration/);

const privateServer = createControlServer({ runtime, pilotDomain: domain, canaryFixture: fixture, canaryFixtureToken: token });
const publicServer = createControlServer({ runtime, plane: { canServe: () => false }, token });
for (const server of [privateServer, publicServer]) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
}

const send = (operation, overrides = {}, authorization = 'Bearer ' + token, server = privateServer) =>
  fetch('http://127.0.0.1:' + server.address().port + '/v1/assist/fixture', {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ ...request, operation, ...overrides }),
  });

try {
  assert.equal((await send('download', {}, undefined, publicServer)).status, 404);
  assert.equal((await send('download', {}, 'Bearer wrong')).status, 401);
  assert.equal((await send('download')).status, 503);

  exercise = async received => {
    assert.deepEqual(received, request);
    for (const overrides of [{ probe_nonce: randomUUID() }, { generation: 2 }, { organization_id: randomUUID() }]) {
      assert.equal((await send('download', overrides)).status, 503);
    }
    assert.equal((await send('download')).status, 200);
    assert.deepEqual(await (await send('viewer')).json(), { status: 'waiting' });
    devices = [{ id: 'node/' + domain + '/first', online: true }];
    const viewers = await Promise.all([send('viewer'), send('viewer')]);
    assert.deepEqual(viewers.map(r => r.status), [200, 200]);
    assert.equal(calls.filter(call => call === 'viewer').length, 1);
    return { checked: true };
  };
  assert.deepEqual(await fixture.probe(request), { checked: true });
  assert.deepEqual(calls, ['create', 'viewer', 'revoke', 'delete']);
  assert.equal((await send('viewer')).status, 503);

  calls = [];
  exercise = async () => ({ checked: true });
  await assert.rejects(fixture.probe(request), /not_exercised/);
  assert.deepEqual(calls, ['create', 'delete']);

  calls = [];
  exercise = async () => {
    devices = [{ id: 'node/' + domain + '/first', online: true }];
    assert.equal((await send('viewer')).status, 200);
    devices.push({ id: 'node/' + domain + '/unexpected', online: true });
    return { checked: true };
  };
  await assert.rejects(fixture.probe(request), /device_changed/);
  assert.deepEqual(calls, ['create', 'viewer', 'revoke', 'delete']);

  calls = [];
  exercise = async () => { throw new Error('remote_probe_failed'); };
  await assert.rejects(fixture.probe(request), /remote_probe_failed/);
  assert.deepEqual(calls, ['create', 'delete']);
} finally {
  await Promise.all([privateServer, publicServer].map(server => new Promise(resolve => server.close(resolve))));
}
console.log('Windows canary fixtures: private authorization, probe binding, temporary device scope and cleanup pass');

const isolationId = randomUUID();
const isolationRuntime = {
  ...runtime,
  target: id => id === dealerDomain(isolationId) ? { port: 1 } : null,
  async inventory(id, group) {
    return id === isolationId ? [] : runtime.inventory(id, group);
  },
  async createViewer(id, ...args) {
    if (id === isolationId) throw new Error('device_offline');
    return runtime.createViewer(id, ...args);
  },
};
let didIsolate = false;
const isolated = createWindowsCanaryFixture({ runtime: isolationRuntime, organizationId, isolationOrganizationId: isolationId, probe: async received => {
  devices = [{ id: 'node/' + domain + '/first', online: true }];
  await isolated.handle({ ...received, operation: 'viewer' });
  if (didIsolate) assert.deepEqual(await isolated.handle({ ...received, operation: 'isolation' }), { denied: true });
  devices = [];
  return { checked: true };
} });
await assert.rejects(isolated.probe(request), /not_exercised/);
didIsolate = true;
assert.deepEqual(await isolated.probe(request), { checked: true });
