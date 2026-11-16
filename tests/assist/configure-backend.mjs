import assert from 'node:assert/strict';
import {mkdtemp, readFile, chmod, rm, symlink, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {configureBackend, hiddenToken} from '../../services/assist/configure-backend.mjs';

const root = await mkdtemp(join(tmpdir(), 'mjv-backend-config-'));
const token = 'sbp_fc_' + 'setup-secret'.repeat(4);
const jwt = ref => 'eyTest.' + Buffer.from(JSON.stringify({role: 'service_role', ref})).toString('base64url') + '.signature';
const serviceKey = jwt('bqtsuzvuvqvgidipbsis');
const calls = [];
let rejectSecret = false, wrongProject = false;
const fetchImpl = async (url, options) => {
  calls.push({url, options});
  assert.equal(options.redirect, 'error');
  assert(options.signal instanceof AbortSignal);
  if (url.endsWith('/api-keys?reveal=true')) return Response.json([{name: 'service_role', api_key: wrongProject ? jwt('wrong') : serviceKey}]);
  if (url.endsWith('/rpc/assist_support_service')) {
    assert.equal(options.headers.apikey, serviceKey);
    const body = JSON.parse(options.body);
    assert.equal(body.p_action, 'access'); assert.equal(body.p_actor_id, null);
    return Response.json({allowed: false});
  }
  if (url.endsWith('/secrets')) {
    if (rejectSecret) return new Response('upstream error with ' + token, {status: 403});
    return new Response(null, {status: 201});
  }
  throw new Error('Unexpected endpoint');
};
const safeFailure = async action => {
  try { await action(); assert.fail('Expected setup to fail'); }
  catch (error) {
    assert.match(error.message, /Assist backend setup failed/);
    assert(!error.message.includes(token)); assert(!error.message.includes(serviceKey));
  }
};
try {
  const input = new PassThrough(); input.isTTY = true;
  const modes = []; input.setRawMode = value => modes.push(value);
  let display = ''; const output = {isTTY: true, write: text => { display += text; }};
  const entered = hiddenToken({input, output});
  input.emit('data', Buffer.from(token + '\r'));
  assert.equal(await entered, token); assert(!display.includes(token)); assert.deepEqual(modes, [true, false]);
  const cancelled = hiddenToken({input, output}); input.emit('data', Buffer.from('\u0003'));
  await assert.rejects(cancelled, /cancelled/); assert.equal(modes.at(-1), false);
  await assert.rejects(hiddenToken({input: {isTTY: false}, output}), /interactive_terminal_required/);
  const envPath = join(root, 'host.env');
  const result = await configureBackend({token, envPath, fetchImpl});
  assert.deepEqual(result, {backend_verified: true, edge_secrets_configured: true, windows_canary_required: true});
  const saved = await readFile(envPath, 'utf8');
  assert.equal((await stat(envPath)).mode & 0o777, 0o600);
  assert(saved.includes(serviceKey)); assert(!saved.includes(token));
  assert(!saved.includes('ASSIST_APPROVED_MESHCENTRAL_VERSION='));
  assert(!saved.includes('ASSIST_CANARY_ORIGIN='));
  const firstSecrets = JSON.parse(calls.at(-1).options.body);
  assert.deepEqual(firstSecrets.map(v => v.name), ['ASSIST_CONTROL_ORIGIN', 'ASSIST_CONTROL_TOKEN', 'ASSIST_PUBLIC_ORIGIN']);
  assert(!JSON.stringify(firstSecrets).includes(serviceKey));
  rejectSecret = true;
  await safeFailure(() => configureBackend({token, envPath, fetchImpl}));
  assert.equal(await readFile(envPath, 'utf8'), saved, 'Upload failure preserves configuration for a retry');
  rejectSecret = false;
  await configureBackend({token, envPath, fetchImpl});
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), firstSecrets, 'Retry reuses the same shared token');
  assert.equal(calls.filter(v => v.url.includes('/api-keys?')).length, 1, 'Retry uses the stored private service key');
  await chmod(envPath, 0o644);
  const previous = calls.length;
  await safeFailure(() => configureBackend({token, envPath, fetchImpl}));
  assert.equal(calls.length, previous, 'Insecure file is rejected before network access');
  await chmod(envPath, 0o600);
  const linked = join(root, 'linked.env'); await symlink(envPath, linked);
  await safeFailure(() => configureBackend({token, envPath: linked, fetchImpl}));
  wrongProject = true;
  const other = join(root, 'other.env');
  await safeFailure(() => configureBackend({token, envPath: other, fetchImpl}));
  await assert.rejects(stat(other), {code: 'ENOENT'});
  wrongProject = false;
  await safeFailure(() => configureBackend({token: 'bad', envPath, fetchImpl}));
  const failing = async () => { throw new Error('network failure: ' + token); };
  await safeFailure(() => configureBackend({token, envPath, fetchImpl: failing}));
  console.log('Assist backend configuration: project boundary, private file, hidden token handling contract, exact Edge secrets and retry safety pass');
} finally { await rm(root, {recursive: true, force: true}); }
