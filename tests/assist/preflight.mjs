import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, chmod, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {preflight} from '../../services/assist/preflight.mjs';
import {stageAgentCache} from '../../services/assist/prepare-agent-cache.mjs';

const root = await mkdtemp(join(tmpdir(), 'mjv-preflight-'));
try {
  const source = join(root, 'source'), installedRoot = join(root, 'runtime'), state = join(root, 'state');
  await Promise.all([mkdir(source), mkdir(join(installedRoot, 'agents'), {recursive: true}), mkdir(state, {mode: 0o700})]);
  const bytes = Buffer.from('isolated test agent');
  const manifest = {schemaVersion: 1, releases: [{tag: 'test-release', files: [{filename: 'MeshService64.exe',
    size: bytes.length, sha384: createHash('sha384').update(bytes).digest('hex')}]}]};
  await writeFile(join(source, 'MeshService64.exe'), bytes);
  await writeFile(join(installedRoot, 'package.json'), JSON.stringify({name: 'meshcentral', version: 'test-version'}));
  await writeFile(join(installedRoot, 'agents/agent-defaults.json'), JSON.stringify(manifest));
  const cache = join(root, 'cache');
  await stageAgentCache({manifest, source, destination: cache, runtimeVersion: 'test-version'});
  const env = {SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret-service-'.repeat(4),
    ASSIST_PUBLIC_ORIGIN: 'https://assist.example.com', ASSIST_CONTROL_ORIGIN: 'https://control.example.com',
    ASSIST_CANARY_ORIGIN: 'https://canary.example.com', ASSIST_CONTROL_TOKEN: 'secret-control-'.repeat(4),
    ASSIST_CANARY_TOKEN: 'secret-canary-'.repeat(4), ASSIST_APPROVED_MESHCENTRAL_VERSION: 'test-version',
    ASSIST_AGENT_CACHE_DIRECTORY: cache, ASSIST_STATE_DIRECTORY: state};
  const options = {installedRoot, platform: 'linux', nodeVersion: '22.0.0'};
  assert.equal((await preflight(env, options)).local_checks_passed, true);
  const failed = async (overrides, name, opts = options) => {
    const result = await preflight({...env, ...overrides}, opts);
    assert.equal(result.local_checks_passed, false);
    assert.equal(result.checks.find(c => c.name === name)?.passed, false);
    const output = JSON.stringify(result);
    for (const value of Object.values({...env, ...overrides})) assert(!output.includes(value), 'report leaked a configuration value');
  };
  await failed({ASSIST_CONTROL_ORIGIN: 'https://secret:password@control.example.com'}, 'ASSIST_CONTROL_ORIGIN');
  await failed({ASSIST_CANARY_ORIGIN: 'https://canary.example.com/?token=secret'}, 'ASSIST_CANARY_ORIGIN');
  await failed({ASSIST_CONTROL_TOKEN: 'short'}, 'ASSIST_CONTROL_TOKEN');
  await failed({ASSIST_CANARY_TOKEN: env.ASSIST_CONTROL_TOKEN}, 'separate_canary_control_tokens');
  await failed({ASSIST_APPROVED_MESHCENTRAL_VERSION: 'other-version'}, 'approved_runtime_version');
  await failed({}, 'node_22_or_newer', {...options, nodeVersion: '20.0.0'});
  await chmod(state, 0o755);
  await failed({}, 'private_state_directory');
  await chmod(state, 0o700);
  const agent = join(cache, 'test-release/MeshService64.exe');
  await writeFile(agent, Buffer.alloc(bytes.length, 0));
  await failed({}, 'complete_verified_agent_cache');
  await rm(agent); await symlink(join(source, 'MeshService64.exe'), agent);
  await failed({}, 'complete_verified_agent_cache');
  await rm(agent); await writeFile(agent, bytes);
  await rm(join(cache, 'mjv-release.json'));
  await failed({}, 'complete_verified_agent_cache');
  console.log('Assist preflight: configuration boundaries, secret-safe reports, permissions, tampering and symlink checks passed');
} finally { await rm(root, {recursive: true, force: true}); }
