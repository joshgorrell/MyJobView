/**
 * Server-only PostgREST adapter for phoneDispatcherPersistence.
 * Supply a trusted Supabase client using a secret server credential.
 * Never import this adapter into browser bundles.
 *
 * Requires the voicemail_messages table and unique constraint on
 * (organization_id, ringcentral_account_id, ringcentral_extension_id,
 *  ringcentral_message_id). This module does not create that schema.
 */
import type { VoicemailState, VoicemailWriteStore } from './phoneDispatcherPersistence';

export interface QueryResult {
  data: Array<{ id: string }> | null;
  error: { message: string; code?: string } | null;
}
export interface SupabaseQuery {
  select(columns: string): SupabaseQuery;
  eq(column: string, value: string): SupabaseQuery;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}
export interface SupabaseTable {
  upsert(
    values: Record<string, unknown>,
    options: { onConflict: string; ignoreDuplicates: true },
  ): SupabaseQuery;
  update(values: Record<string, unknown>): SupabaseQuery;
}
export interface SupabaseStoreClient {
  from(table: 'voicemail_messages'): SupabaseTable;
}
const UNIQUE = [
  'organization_id', 'ringcentral_account_id',
  'ringcentral_extension_id', 'ringcentral_message_id',
].join(',');

export class SupabaseVoicemailWriteStore implements VoicemailWriteStore {
  constructor(private readonly client: SupabaseStoreClient) {}
  async insert(row: Record<string, unknown>): Promise<{ inserted: boolean }> {
    const { data, error } = await this.client.from('voicemail_messages')
      .upsert(row, { onConflict: UNIQUE, ignoreDuplicates: true })
      .select('id');
    if (error) throw Error('Voicemail claim failed: ' + error.code);
    // ON CONFLICT DO NOTHING returns no inserted row for duplicate deliveries.
    return { inserted: Array.isArray(data) && data.length === 1 };
  }
  async updateWhere(
    identity: Record<string, string>,
    expectedState: VoicemailState,
    values: Record<string, unknown>,
  ): Promise<{ updated: boolean }> {
    let query = this.client.from('voicemail_messages').update(values);
    for (const key of UNIQUE.split(',')) {
      const value = identity[key];
      if (!value) throw Error('Missing voicemail identity: ' + key);
      query = query.eq(key, value);
    }
    const { data, error } = await query.eq('state', expectedState).select('id');
    if (error) throw Error('Voicemail transition failed: ' + error.code);
    return { updated: Array.isArray(data) && data.length === 1 };
  }
}
