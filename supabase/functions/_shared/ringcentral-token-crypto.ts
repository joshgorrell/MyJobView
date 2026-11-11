/**
 * AES-256-GCM envelope for server-side OAuth credentials.
 * Supply PHONE_DISPATCHER_TOKEN_ENCRYPTION_KEY as a random 32-byte base64
 * secret from the deployment secret manager. Never send it to browsers.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function unbase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = unbase64(base64Key);
  if (raw.byteLength !== 32) throw Error('Invalid OAuth encryption key');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function context(organizationId: string, accountId: string, purpose: string): Uint8Array {
  if (!organizationId || !accountId || !['access', 'refresh'].includes(purpose)) {
    throw Error('Invalid OAuth encryption context');
  }
  return encoder.encode(['ringcentral-oauth-v1', organizationId, accountId, purpose].join(':'));
}
export async function encryptOAuthToken(
  token: string, base64Key: string, organizationId: string, accountId: string, purpose: 'access' | 'refresh',
): Promise<string> {
  if (!token || token.length > 8192) throw Error('Invalid OAuth token');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: context(organizationId, accountId, purpose),
  }, await importKey(base64Key), encoder.encode(token));
  return 'v1.' + base64(iv) + '.' + base64(new Uint8Array(encrypted));
}
export async function decryptOAuthToken(
  envelope: string, base64Key: string, organizationId: string, accountId: string, purpose: 'access' | 'refresh',
): Promise<string> {
  const parts = envelope.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw Error('Invalid OAuth token envelope');
  const iv = unbase64(parts[1]);
  if (iv.length !== 12) throw Error('Invalid OAuth token IV');
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv, additionalData: context(organizationId, accountId, purpose),
  }, await importKey(base64Key), unbase64(parts[2]));
  return decoder.decode(plaintext);
}
