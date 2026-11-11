import { RingCentralOAuthClient } from './ringcentral-oauth.ts';
import { encryptOAuthToken, decryptOAuthToken } from './ringcentral-token-crypto.ts';

export interface OAuthConnectionRow {
  organization_id: string;
  ringcentral_account_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  access_expires_at: string;
  refresh_expires_at: string | null;
  token_version: number;
  status: string;
}
export interface OAuthConnectionStore {
  read(accountId: string, organizationId: string): Promise<OAuthConnectionRow | null>;
  rotate(previous: OAuthConnectionRow, next: Partial<OAuthConnectionRow>): Promise<boolean>;
}
/**
 * Only called from trusted server workers after mailbox/org verification.
 * CAS prevents stale refresh responses from overwriting a newer rotation.
 * On conflict, reread once; never reuse a rotated refresh token.
 */
export async function getRingCentralAccessToken(
  store: OAuthConnectionStore,
  oauth: RingCentralOAuthClient,
  encryptionKey: string,
  organizationId: string,
  accountId: string,
  now = Date.now(),
): Promise<string> {
  const read = () => store.read(accountId, organizationId);
  const connection = await read();
  if (!connection || connection.status !== 'connected') throw Error('RingCentral account not connected');
  const decryptAccess = (row: OAuthConnectionRow) => decryptOAuthToken(
    row.encrypted_access_token, encryptionKey, organizationId, accountId, 'access');
  if (Date.parse(connection.access_expires_at) > now + 60_000) return decryptAccess(connection);
  if (connection.refresh_expires_at && Date.parse(connection.refresh_expires_at) <= now) {
    throw Error('RingCentral authorization expired');
  }
  const refresh = await decryptOAuthToken(
    connection.encrypted_refresh_token, encryptionKey, organizationId, accountId, 'refresh');
  const next = await oauth.refresh(refresh, now);
  const rotated = await store.rotate(connection, {
    encrypted_access_token: await encryptOAuthToken(
      next.accessToken, encryptionKey, organizationId, accountId, 'access'),
    encrypted_refresh_token: await encryptOAuthToken(
      next.refreshToken, encryptionKey, organizationId, accountId, 'refresh'),
    access_expires_at: next.expiresAt,
    refresh_expires_at: next.refreshExpiresAt ?? connection.refresh_expires_at,
    token_version: connection.token_version + 1,
  });
  if (rotated) return next.accessToken;
  const latest = await read();
  if (!latest || latest.status !== 'connected' ||
      latest.token_version <= connection.token_version ||
      Date.parse(latest.access_expires_at) <= now + 60_000) {
    throw Error('Concurrent RingCentral refresh not yet usable');
  }
  return decryptAccess(latest);
}
