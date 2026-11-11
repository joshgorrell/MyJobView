/**
 * Server-only tenant lookup. Caller must provide a trusted service-role
 * Supabase client; never expose this module or credentials to browsers.
 */
export interface MailboxQueryResult {
  data: { organization_id: string } | null;
  error: { code?: string } | null;
}
export interface MailboxQuery {
  eq(column: string, value: string | boolean): MailboxQuery;
  maybeSingle(): Promise<MailboxQueryResult>;
}
export interface MailboxClient {
  from(table: 'ringcentral_mailboxes'): {
    select(columns: 'organization_id'): MailboxQuery;
  };
}
const ID = /^[A-Za-z0-9_-]{1,128}$/;
export class RingCentralMailboxResolver {
  constructor(private readonly client: MailboxClient) {}
  async resolve(accountId: string, extensionId: string): Promise<{ organizationId: string } | null> {
    if (!ID.test(accountId) || !ID.test(extensionId)) return null;
    const { data, error } = await this.client.from('ringcentral_mailboxes')
      .select('organization_id')
      .eq('ringcentral_account_id', accountId)
      .eq('ringcentral_extension_id', extensionId)
      .eq('enabled', true)
      .maybeSingle();
    if (error) throw Error('Mailbox lookup failed: ' + (error.code ?? 'unknown'));
    if (!data?.organization_id) return null;
    return { organizationId: data.organization_id };
  }
}
