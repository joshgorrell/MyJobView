import { encryptOAuthToken } from './ringcentral-token-crypto.ts';

const ORIGINS = new Set(['https://platform.ringcentral.com', 'https://platform.devtest.ringcentral.com']);
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function createRingCentralOAuthState(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}
export function ringCentralAuthorizeUrl(input: {
  origin: string; clientId: string; redirectUri: string; state: string;
}): string {
  if (!ORIGINS.has(input.origin) || !input.clientId ||
      !/^[-_A-Za-z0-9]{40,100}$/.test(input.state)) throw Error('Invalid OAuth authorization configuration');
  const redirect = new URL(input.redirectUri);
  if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash) {
    throw Error('Invalid OAuth redirect URI');
  }
  const url = new URL('/restapi/oauth/authorize', input.origin);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: input.clientId,
    redirect_uri: input.redirectUri, state: input.state,
  }).toString();
  return url.toString();
}
export interface RingCentralCodeExchange {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string | null;
}
export async function exchangeRingCentralCode(input: {
  origin: string; clientId: string; clientSecret: string; redirectUri: string;
  code: string; transport?: typeof fetch; now?: number;
}): Promise<RingCentralCodeExchange> {
  if (!ORIGINS.has(input.origin) || !input.clientId || !input.clientSecret ||
      !input.code || input.code.length > 8192) throw Error('Invalid OAuth code exchange');
  const response = await (input.transport ?? fetch)(input.origin + '/restapi/oauth/token', {
    method: 'POST', redirect: 'error',
    headers: {
      authorization: 'Basic ' + btoa(input.clientId + ':' + input.clientSecret),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: input.code, redirect_uri: input.redirectUri,
    }),
  });
  if (!response.ok) throw Error('RingCentral authorization exchange failed');
  const result = await response.json() as Record<string, unknown>;
  if (typeof result.access_token !== 'string' || !result.access_token ||
      typeof result.refresh_token !== 'string' || !result.refresh_token ||
      typeof result.expires_in !== 'number' || result.expires_in <= 0 ||
      !Number.isFinite(result.expires_in)) throw Error('Invalid RingCentral authorization response');
  const now = input.now ?? Date.now();
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: new Date(now + result.expires_in * 1000).toISOString(),
    refreshExpiresAt: typeof result.refresh_token_expires_in === 'number' &&
      result.refresh_token_expires_in > 0
      ? new Date(now + result.refresh_token_expires_in * 1000).toISOString() : null,
  };
}
export async function encryptRingCentralCodeExchange(
  tokens: RingCentralCodeExchange, key: string, organizationId: string, accountId: string,
) {
  return {
    organization_id: organizationId, ringcentral_account_id: accountId,
    encrypted_access_token: await encryptOAuthToken(tokens.accessToken, key, organizationId, accountId, 'access'),
    encrypted_refresh_token: await encryptOAuthToken(tokens.refreshToken, key, organizationId, accountId, 'refresh'),
    access_expires_at: tokens.expiresAt, refresh_expires_at: tokens.refreshExpiresAt,
    status: 'connected' as const,
  };
}
