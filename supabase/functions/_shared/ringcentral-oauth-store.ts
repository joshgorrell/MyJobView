import type { OAuthConnectionRow, OAuthConnectionStore } from './ringcentral-token-provider.ts';
type DB = { from(table: string): any };
export class SupabaseRingCentralOAuthStore implements OAuthConnectionStore {
  constructor(private readonly db: DB) {}
  async read(accountId: string, organizationId: string): Promise<OAuthConnectionRow | null> {
    const { data, error } = await this.db.from('ringcentral_oauth_connections')
      .select('organization_id,ringcentral_account_id,encrypted_access_token,encrypted_refresh_token,access_expires_at,refresh_expires_at,token_version,status')
      .eq('organization_id', organizationId).eq('ringcentral_account_id', accountId).maybeSingle();
    if (error) throw Error('RingCentral connection lookup failed');
    return data as OAuthConnectionRow | null;
  }
  async acquireRefreshLease(previous: OAuthConnectionRow, leaseId: string, now: number): Promise<boolean> {
    const { data, error } = await this.db.from('ringcentral_oauth_connections')
      .update({
        refresh_lease_id: leaseId,
        refresh_lease_expires_at: new Date(now + 120_000).toISOString(),
      })
      .eq('organization_id', previous.organization_id)
      .eq('ringcentral_account_id', previous.ringcentral_account_id)
      .eq('token_version', previous.token_version)
      .eq('status', 'connected')
      .or(`refresh_lease_id.is.null,refresh_lease_expires_at.lt.${new Date(now).toISOString()}`)
      .select('refresh_lease_id');
    if (error) throw Error('RingCentral refresh lease acquisition failed');
    return Array.isArray(data) && data.length === 1 && data[0].refresh_lease_id === leaseId;
  }
  async releaseRefreshLease(previous: OAuthConnectionRow, leaseId: string): Promise<void> {
    const { error } = await this.db.from('ringcentral_oauth_connections')
      .update({ refresh_lease_id: null, refresh_lease_expires_at: null })
      .eq('organization_id', previous.organization_id)
      .eq('ringcentral_account_id', previous.ringcentral_account_id)
      .eq('refresh_lease_id', leaseId);
    if (error) throw Error('RingCentral refresh lease release failed');
  }
  async rotate(previous: OAuthConnectionRow, next: Partial<OAuthConnectionRow>, leaseId: string): Promise<boolean> {
    const { data, error } = await this.db.from('ringcentral_oauth_connections')
      .update({ ...next, refresh_lease_id: null, refresh_lease_expires_at: null,
        updated_at: new Date().toISOString() })
      .eq('organization_id', previous.organization_id)
      .eq('ringcentral_account_id', previous.ringcentral_account_id)
      .eq('token_version', previous.token_version)
      .eq('refresh_lease_id', leaseId)
      .eq('status', 'connected').select('token_version');
    if (error) throw Error('RingCentral connection rotation failed');
    return Array.isArray(data) && data.length === 1;
  }
}
