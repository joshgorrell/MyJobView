/**
 * OAuth state helpers. State is generated with crypto.getRandomValues and
 * stored as SHA-256 digest, never plaintext. Consumption must be atomic.
 */
export async function hashRingCentralOAuthState(state: string): Promise<string> {
  if (!/^[-_A-Za-z0-9]{40,100}$/.test(state)) throw Error('Invalid OAuth state');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export interface RingCentralPendingState {
  organization_id: string;
  initiated_by: string;
  redirect_uri: string;
}
export interface RingCentralStateStore {
  create(input: RingCentralPendingState & { state_hash: string; expires_at: string }): Promise<void>;
  consume(hash: string): Promise<RingCentralPendingState | null>;
}
export async function registerRingCentralState(
  store: RingCentralStateStore, state: string, details: RingCentralPendingState, now = Date.now(),
): Promise<void> {
  await store.create({
    ...details, state_hash: await hashRingCentralOAuthState(state),
    expires_at: new Date(now + 10 * 60_000).toISOString(),
  });
}
export async function consumeRingCentralState(
  store: RingCentralStateStore, state: string,
): Promise<RingCentralPendingState> {
  const details = await store.consume(await hashRingCentralOAuthState(state));
  if (!details) throw Error('OAuth state invalid, expired or already consumed');
  return details;
}
