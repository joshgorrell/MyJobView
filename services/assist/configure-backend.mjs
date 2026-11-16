import {randomBytes, randomUUID} from 'node:crypto';
import {lstat, readFile, open, link, unlink} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';

const project = 'bqtsuzvuvqvgidipbsis';
const publicOrigin = 'https://assist.myjobview.com';
const controlOrigin = 'https://assist-control.myjobview.com';
const backend = `https://${project}.supabase.co`;
const settings = {
  SUPABASE_URL: backend,
  ASSIST_CONTROL_ORIGIN: controlOrigin,
  ASSIST_PUBLIC_ORIGIN: publicOrigin,
  ASSIST_STATE_DIRECTORY: '/var/lib/mjv-assist',
  ASSIST_AGENT_CACHE_DIRECTORY: '/opt/myjobview/releases/meshcentral-1.3.1-candidate/agentbuilds',
  ASSIST_CONTROL_PORT: '8443',
};

async function jsonRequest(fetchImpl, url, options) {
  const response = await fetchImpl(url, {...options, redirect: 'error', signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error('backend_request_failed');
  let body = '';
  if (response.body) for await (const chunk of response.body) {
    body += Buffer.from(chunk).toString('utf8');
    if (Buffer.byteLength(body) > 65536) throw new Error('backend_response_too_large');
  }
  return body.trim() ? JSON.parse(body) : null;
}

function validateConfig(config) {
  for (const [name, value] of Object.entries(settings)) if (config[name] !== value) throw new Error('host_configuration_mismatch');
  if (!/^[a-f0-9]{96}$/.test(config.ASSIST_CONTROL_TOKEN || '')) throw new Error('invalid_control_token');
  const key = config.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof key !== 'string' || !/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) throw new Error('legacy_service_key_required');
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
  if (claims.role !== 'service_role' || claims.ref !== project) throw new Error('wrong_backend_key');
}

async function readExisting(path, owner) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.uid !== owner || (info.mode & 0o777) !== 0o600) throw new Error('insecure_configuration_file');
    const config = {};
    for (const line of (await readFile(path, 'utf8')).split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^([A-Z_]+)="([^"\r\n]*)"$/);
      if (!match || Object.hasOwn(config, match[1])) throw new Error('invalid_configuration_file');
      config[match[1]] = match[2];
    }
    validateConfig(config);
    return config;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// Never overwrites an existing configuration, including on a concurrent setup run.
async function saveNew(path, config) {
  const temporary = join(dirname(path), `.mjv-assist-${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile('# MJV Assist backend connection. Windows release approval/canary remain unconfigured.\n' +
      Object.entries(config).map(([key, value]) => `${key}="${value}"`).join('\n') + '\n');
    await file.sync(); await file.close();
    await link(temporary, path);
  } finally { await file.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
}

export async function configureBackend({token, envPath = '/etc/mjv-assist.env', owner = process.getuid(), fetchImpl = fetch}) {
  try {
    if (typeof token !== 'string' || !/^sbp_[A-Za-z0-9_-]{20,4096}$/.test(token)) throw new Error('invalid_setup_token');
    const managementHeaders = {authorization: `Bearer ${token}`, 'content-type': 'application/json'};
    const existing = await readExisting(envPath, owner);
    let config = existing;
    if (!config) {
      const keys = await jsonRequest(fetchImpl, `https://api.supabase.com/v1/projects/${project}/api-keys?reveal=true`, {headers: managementHeaders});
      const key = Array.isArray(keys) && keys.find(k => k.name === 'service_role' || k.role === 'service_role');
      config = {...settings, SUPABASE_SERVICE_ROLE_KEY: key?.api_key, ASSIST_CONTROL_TOKEN: randomBytes(48).toString('hex')};
      validateConfig(config);
    }
    // Read-only authorization check: never claims jobs, creates sessions or enables dealers.
    const check = await jsonRequest(fetchImpl, `${backend}/rest/v1/rpc/assist_support_service`, {
      method: 'POST', headers: {'content-type': 'application/json', apikey: config.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`},
      body: JSON.stringify({p_action: 'access', p_organization_id: randomUUID(), p_actor_id: null,
        p_auth_session_id: null, p_params: {}}),
    });
    if (check?.allowed !== false) throw new Error('unexpected_backend_response');
    if (!existing) await saveNew(envPath, config);
    // Only these three Assist Edge secrets are written. The setup PAT is never saved.
    await jsonRequest(fetchImpl, `https://api.supabase.com/v1/projects/${project}/secrets`, {
      method: 'POST', headers: managementHeaders,
      body: JSON.stringify(['ASSIST_CONTROL_ORIGIN', 'ASSIST_CONTROL_TOKEN', 'ASSIST_PUBLIC_ORIGIN']
        .map(name => ({name, value: config[name]}))),
    });
    return {backend_verified: true, edge_secrets_configured: true, windows_canary_required: true};
  } catch { throw new Error('Assist backend setup failed; check token scope, existing configuration and connectivity. Credentials were not printed.'); }
}

export async function hiddenToken({input = process.stdin, output = process.stdout} = {}) {
  if (!input.isTTY || !output.isTTY) throw new Error('interactive_terminal_required');
  output.write('Paste the temporary Supabase setup token, then press Enter (input hidden): ');
  input.setRawMode(true); input.resume();
  try {
    return await new Promise((resolve, reject) => {
      let value = '';
      const end = (error) => { input.off('data', data); error ? reject(error) : resolve(value); };
      const data = chunk => {
        for (const character of chunk.toString('utf8')) {
          if (character === '\u0003' || character === '\u0004') return end(new Error('cancelled'));
          if (character === '\r' || character === '\n') return end();
          if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
          else if (/^[A-Za-z0-9_-]$/.test(character)) value += character;
          else return end(new Error('invalid_input'));
          if (value.length > 4100) return end(new Error('input_too_long'));
        }
      };
      input.on('data', data);
    });
  } finally { input.setRawMode(false); input.pause(); output.write('\n'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.getuid() !== 0 || process.argv.length !== 2) throw new Error('root_interactive_setup_required');
    await configureBackend({token: await hiddenToken()});
    console.log('MJV backend verified; private host settings saved; three Assist Edge secrets configured.');
    console.log('No service started or dealer enabled. Windows canary and release approval remain required. Revoke the temporary setup token now.');
  } catch {
    console.error('Assist backend setup did not complete. Check token permissions and connectivity; never paste credentials into chat.');
    process.exitCode = 1;
  }
}
