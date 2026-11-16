/**
 * Server-only tenant lookup. Caller must provide a trusted service-role
 * Supabase client; never expose this module or credentials to browsers.
 */
export interface MailboxQueryResult {
  data: { organization_id: string; ringcentral_account_id?: string } | null;
  error: { code?: string } | null;
}
export interface MailboxQuery {
  eq(column: string, value: string | boolean): MailboxQuery;
  maybeSingle(): Promise<MailboxQueryResult>;
}
export interface MailboxClient {
  from(table: 'ringcentral_mailboxes'): {
    select(columns: string): MailboxQuery;
  };
}
const ID = /^[A-Za-z0-9_-]{1,128}$/;
export class RingCentralMailboxResolver {
  constructor(private readonly client: MailboxClient) {}
  async resolve(accountId: string, extensionId: string): Promise<{ organizationId: string; accountId?: string } | null> {
    if ((accountId !== '~' && !ID.test(accountId)) || !ID.test(extensionId)) return null;
    let query = this.client.from('ringcentral_mailboxes')
      .select(accountId === '~' ? 'organization_id,ringcentral_account_id' : 'organization_id');
    if(accountId !== '~') query=query.eq('ringcentral_account_id', accountId);
    const { data, error } = await query
      .eq('ringcentral_extension_id', extensionId)
      .eq('enabled', true)
      .maybeSingle();
    if (error) throw Error('Mailbox lookup failed: ' + (error.code ?? 'unknown'));
    if (!data?.organization_id) return null;
    if(accountId === '~') {
      if(!data.ringcentral_account_id)throw Error('Canonical account missing');
      return {organizationId:data.organization_id,accountId:data.ringcentral_account_id};
    }
    return { organizationId: data.organization_id };
  }
}

