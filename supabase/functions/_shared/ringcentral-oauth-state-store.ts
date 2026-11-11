import type { RingCentralPendingState, RingCentralStateStore } from './ringcentral-oauth-state.ts';
type DB = { from(table: string): any; schema(name: string): any };
export class SupabaseRingCentralStateStore implements RingCentralStateStore {
  constructor(private readonly db: DB) {}
  async create(input: RingCentralPendingState & { state_hash: string; expires_at: string }): Promise<void> {
    const { error } = await this.db.from('ringcentral_oauth_states').insert(input);
    if (error) throw Error('Failed to create RingCentral OAuth state');
  }
  async consume(hash: string): Promise<RingCentralPendingState | null> {
    // Explicit private schema RPC is atomic; no public RPC exposed to browsers.
    const { data, error } = await this.db.schema('private')
      .rpc('consume_ringcentral_oauth_state', { p_hash: hash });
    if (error) throw Error('Failed to consume RingCentral OAuth state');
    return Array.isArray(data) && data.length === 1 ? data[0] as RingCentralPendingState : null;
  }
}
