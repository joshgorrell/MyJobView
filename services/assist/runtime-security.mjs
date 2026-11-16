import {dirname} from 'node:path';
import {prepareGuestRuntime,verifyGuestRuntime} from './guest-runtime-security.mjs';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';

const originalHash = '19de2c8d87e8bbd12b1a7b46fe0dfa4a78c3c46a70464814b1f106af1d07eb26';
const patchedHash = 'd90ea028097d37ba8170f9fdaf7374c96e5fe187dc5aed96fac7558122d2f880';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const replacements = [
  ["'compression@1.8.1'", "'compression@1.8.2'"],
  ["'node-forge@1.4.0'", "'node-forge@1.4.3'"],
  ['function InstallModuleEx(modulenames, args, func) {',
    "function InstallModuleEx(modulenames, args, func) { throw new Error('MJV runtime dependencies must be prepared offline');"],
];

export function patchRuntimeSource(bytes) {
  if (digest(bytes) === patchedHash) return bytes;
  if (digest(bytes) !== originalHash) throw new Error('unexpected_runtime_source');
  let source = bytes.toString('utf8');
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2) throw new Error('unexpected_runtime_patch_target');
    source = source.replace(before, after);
  }
  const patched = Buffer.from(source);
  if (digest(patched) !== patchedHash) throw new Error('unexpected_runtime_patch_result');
  return patched;
}

export async function verifyRuntimeSecurity(entry) {
  if (digest(await readFile(entry)) !== patchedHash) throw new Error('runtime_security_preparation_required');
  await verifyGuestRuntime(dirname(entry));
  const require = createRequire(entry);
  for (const [name, version] of [['compression', '1.8.2'], ['node-forge', '1.4.3']]) {
    if (require(name + '/package.json').version !== version) throw new Error('unexpected_runtime_dependency');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const entry = fileURLToPath(new URL('./node_modules/meshcentral/meshcentral.js', import.meta.url));
    if (process.argv.length !== 2) throw new Error('invalid_arguments');
    await writeFile(entry, patchRuntimeSource(await readFile(entry)));
    await prepareGuestRuntime(dirname(entry));
    await verifyRuntimeSecurity(entry);
    console.log('Assist runtime dependency pins prepared; runtime package installation disabled');
  } catch {
    console.error('Assist runtime preparation failed; use the exact lockfile and supported runtime source');
    process.exitCode = 1;
  }
}
