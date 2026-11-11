import type { RingCentralPendingState, RingCentralStateStore } from './ringcentral-oauth-state.ts';
type DB = { from(table: string): any };
export class SupabaseRingCentralStateStore implements RingCentralStateStore {
  constructor(private readonly db: DB) {}
  async create(input: RingCentralPendingState & { state_hash: string; expires_at: string }): Promise<void> {
    const { error } = await this.db.from('ringcentral_oauth_states').insert(input);
    if (error) throw Error('Failed to create RingCentral OAuth state');
  }
  async consume(hash: string): Promise<RingCentralPendingState | null> {
    // Atomic UPDATE...RETURNING via PostgREST; exactly one callback wins.
    // Uses service-role access; table remains inaccessible to browser roles.
    const now = new Date().toISOString();
    const { data, error } = await this.db.from('ringcentral_oauth_states')
      .update({ consumed_at: now })
      .eq('state_hash', hash)
      .is('consumed_at', null)
      .gt('expires_at', now)
      .select('organization_id,initiated_by,redirect_uri');
    if (error) throw Error('Failed to consume RingCentral OAuth state');
    return Array.isArray(data) && data.length === 1 ? data[0] as RingCentralPendingState : null;
  }
}
