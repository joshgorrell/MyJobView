import {readFile, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, isAbsolute, dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const runtimeRoot = fileURLToPath(new URL('./node_modules/meshcentral/', import.meta.url));
const safeName = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const origin = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value; }
  catch { return false; }
};

// Read-only local diagnostics. Never returns configuration values or exception text.
export async function preflight(env, {platform = process.platform, nodeVersion = process.versions.node,
  uid = process.getuid?.(), installedRoot = env.ASSIST_MESHCENTRAL_ENTRY ? dirname(resolve(env.ASSIST_MESHCENTRAL_ENTRY)) : runtimeRoot} = {}) {
  const checks = [];
  const check = (name, passed) => checks.push({name, passed: !!passed});
  check('linux_host', platform === 'linux');
  check('node_22_or_newer', Number(nodeVersion.split('.')[0]) >= 22);
  for (const key of ['SUPABASE_URL', 'ASSIST_CONTROL_ORIGIN', 'ASSIST_PUBLIC_ORIGIN', 'ASSIST_CANARY_ORIGIN']) {
    check(key, origin(env[key]));
  }
  check('separate_control_public_origins', !!env.ASSIST_CONTROL_ORIGIN && !!env.ASSIST_PUBLIC_ORIGIN &&
    env.ASSIST_CONTROL_ORIGIN !== env.ASSIST_PUBLIC_ORIGIN);
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'ASSIST_CONTROL_TOKEN', 'ASSIST_CANARY_TOKEN']) {
    check(key, typeof env[key] === 'string' && env[key].length >= 32);
  }
  check('separate_canary_control_tokens', !!env.ASSIST_CANARY_TOKEN && !!env.ASSIST_CONTROL_TOKEN &&
    env.ASSIST_CANARY_TOKEN !== env.ASSIST_CONTROL_TOKEN);
  const port = Number(env.ASSIST_CONTROL_PORT || 8443);
  check('control_port', Number.isInteger(port) && port >= 1024 && port <= 65535);
  const state = env.ASSIST_STATE_DIRECTORY || '/var/lib/mjv-assist';
  try {
    const info = await lstat(state);
    check('private_state_directory', isAbsolute(state) && info.isDirectory() &&
      (info.mode & 0o077) === 0 && info.uid === uid && (info.mode & 0o700) === 0o700);
  } catch { check('private_state_directory', false); }
  let pkg, manifest;
  try {
    pkg = JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8'));
    manifest = JSON.parse(await readFile(join(installedRoot, 'agents/agent-defaults.json'), 'utf8'));
    check('approved_runtime_version', pkg.name === 'meshcentral' && pkg.version === env.ASSIST_APPROVED_MESHCENTRAL_VERSION);
  } catch { check('approved_runtime_version', false); }
  try {
    const cache = env.ASSIST_AGENT_CACHE_DIRECTORY;
    if (!isAbsolute(cache || '') || !manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.releases)) throw new Error();
    const metadata = JSON.parse(await readFile(join(cache, 'mjv-release.json'), 'utf8'));
    if (metadata.runtime_version !== pkg.version || metadata.manifest_sha256 !==
      createHash('sha256').update(JSON.stringify(manifest)).digest('hex')) throw new Error();
    let files = 0, windows = false;
    const names = new Set();
    for (const release of manifest.releases) {
      if (!safeName.test(release.tag) || !Array.isArray(release.files)) throw new Error();
      // Reject links inside the immutable cache, including links to another release.
      if (!(await lstat(join(cache, release.tag))).isDirectory()) throw new Error();
      for (const file of release.files) {
        if (!safeName.test(file.filename) || names.has(file.filename) || !Number.isSafeInteger(file.size) ||
          file.size <= 0 || !/^[a-f0-9]{96}$/.test(file.sha384)) throw new Error();
        names.add(file.filename);
        const path = join(cache, release.tag, file.filename);
        if (!(await lstat(path)).isFile()) throw new Error();
        const bytes = await readFile(path);
        if (bytes.length !== file.size || createHash('sha384').update(bytes).digest('hex') !== file.sha384) throw new Error();
        files++; windows ||= file.filename === 'MeshService64.exe';
      }
    }
    check('complete_verified_agent_cache', files > 0 && windows && files === metadata.files);
  } catch { check('complete_verified_agent_cache', false); }
  return {local_checks_passed: checks.every(c => c.passed), checks,
    live_windows_verification: 'required',
    deployment_verification: 'DNS/TLS, reverse proxy, supervisor, backups, capacity and real Windows canary still require verification'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await preflight(process.env);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.local_checks_passed ? 0 : 1;
}
