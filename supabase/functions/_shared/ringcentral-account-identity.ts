/**
 * Verify the actual RingCentral account after OAuth code exchange.
 * Never derive the account identifier from a browser request, state query,
 * webhook payload, or an unverified user-supplied mailbox.
 */
export interface RingCentralVerifiedIdentity {
  accountId: string;
  extensionId: string;
}
export async function verifyRingCentralIdentity(
  accessToken: string,
  transport: typeof fetch = fetch,
  origin = 'https://platform.ringcentral.com',
): Promise<RingCentralVerifiedIdentity> {
  if (!['https://platform.ringcentral.com', 'https://platform.devtest.ringcentral.com'].includes(origin)) {
    throw Error('Unapproved RingCentral API origin');
  }
  if (!accessToken || accessToken.length > 8192) throw Error('Invalid RingCentral access token');
  const response = await transport(origin + '/restapi/v1.0/account/~/extension/~', {
    method: 'GET', redirect: 'error',
    headers: { authorization: 'Bearer ' + accessToken, accept: 'application/json' },
  });
  if (!response.ok) throw Error('RingCentral account identity lookup failed');
  const body = await response.json() as Record<string, unknown>;
  const account = body.account;
  const accountId = typeof account === 'object' && account !== null
    ? (account as Record<string, unknown>).id : null;
  const extensionId = body.id;
  const valid = (value: unknown): value is string | number =>
    (typeof value === 'string' && /^[0-9]{1,32}$/.test(value)) ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
  if (!valid(accountId) || !valid(extensionId)) {
    throw Error('RingCentral account identity response missing identifiers');
  }
  return { accountId: String(accountId), extensionId: String(extensionId) };
}
