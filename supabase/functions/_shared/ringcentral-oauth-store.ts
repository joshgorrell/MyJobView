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
  async rotate(previous: OAuthConnectionRow, next: Partial<OAuthConnectionRow>): Promise<boolean> {
    const { data, error } = await this.db.from('ringcentral_oauth_connections')
      .update({ ...next, updated_at: new Date().toISOString() })
      .eq('organization_id', previous.organization_id)
      .eq('ringcentral_account_id', previous.ringcentral_account_id)
      .eq('token_version', previous.token_version)
      .eq('status', 'connected').select('token_version');
    if (error) throw Error('RingCentral connection rotation failed');
    return Array.isArray(data) && data.length === 1;
  }
}
