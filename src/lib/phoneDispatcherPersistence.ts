/**
 * Durable voicemail persistence contract. All writes are made by a trusted
 * server-side worker after verifying the RingCentral event and tenant mailbox.
 * Do not expose this repository or service-role credentials to browsers.
 */
export type VoicemailState = 'received' | 'processing' | 'ready' | 'review' | 'quarantined' | 'failed';
export type VoicemailDepartment = 'sales' | 'service' | 'projects' | 'security' | 'accounting' | 'administration';

export interface VoicemailRecord {
  organizationId: string;
  accountId: string;
  extensionId: string;
  messageId: string;
  state: VoicemailState;
  callerNumber: string | null;
  contactId: string | null;
  transcript: string | null;
  summary: string | null;
  department: VoicemailDepartment | null;
  departmentConfidence: number | null;
  spamConfidence: number | null;
  urgent: boolean;
  callbackRequested: boolean;
  recordingPath: string | null;
  quarantineExpiresAt: string | null;
  lastError: string | null;
}

export interface VoicemailRepository {
  /**
   * Atomic INSERT ON CONFLICT DO NOTHING on the scoped dedupe tuple.
   * Must return false when another delivery already claimed the voicemail.
   */
  claim(identity: Pick<VoicemailRecord, 'organizationId' | 'accountId' | 'extensionId' | 'messageId'>): Promise<boolean>;
  /**
   * Conditional state transition, scoped by the full identity tuple.
   * Never overwrite a ready or quarantined record from a late retry.
   */
  transition(
    identity: Pick<VoicemailRecord, 'organizationId' | 'accountId' | 'extensionId' | 'messageId'>,
    expectedState: VoicemailState,
    next: Partial<Omit<VoicemailRecord, 'organizationId' | 'accountId' | 'extensionId' | 'messageId'>>,
  ): Promise<boolean>;
}

export interface VoicemailWriteStore {
  insert(row: Record<string, unknown>): Promise<{ inserted: boolean }>;
  updateWhere(
    identity: Record<string, string>,
    expectedState: VoicemailState,
    values: Record<string, unknown>,
  ): Promise<{ updated: boolean }>;
}

const STATES: Readonly<Record<VoicemailState, readonly VoicemailState[]>> = {
  received: ['processing', 'failed'],
  processing: ['ready', 'review', 'quarantined', 'failed'],
  ready: ['review'],
  review: ['ready', 'quarantined'],
  quarantined: ['review'],
  failed: ['processing'],
};
const DEPARTMENTS = new Set(['sales', 'service', 'projects', 'security', 'accounting', 'administration']);
function identity(row: Pick<VoicemailRecord, 'organizationId' | 'accountId' | 'extensionId' | 'messageId'>) {
  for (const value of [row.organizationId, row.accountId, row.extensionId, row.messageId]) {
    if (typeof value !== 'string' || !value.trim()) throw Error('Incomplete voicemail identity');
  }
  return {
    organization_id: row.organizationId,
    ringcentral_account_id: row.accountId,
    ringcentral_extension_id: row.extensionId,
    ringcentral_message_id: row.messageId,
  };
}
export class DurableVoicemailRepository implements VoicemailRepository {
  constructor(private readonly store: VoicemailWriteStore) {}
  async claim(row: Pick<VoicemailRecord, 'organizationId' | 'accountId' | 'extensionId' | 'messageId'>): Promise<boolean> {
    const result = await this.store.insert({ ...identity(row), state: 'received' });
    return result.inserted;
  }
  async transition(
    row: Pick<VoicemailRecord, 'organizationId' | 'accountId' | 'extensionId' | 'messageId'>,
    expectedState: VoicemailState,
    next: Partial<Omit<VoicemailRecord, 'organizationId' | 'accountId' | 'extensionId' | 'messageId'>>,
  ): Promise<boolean> {
    if (!next.state || !STATES[expectedState]?.includes(next.state)) throw Error('Invalid voicemail state transition');
    if (next.department !== undefined && next.department !== null && !DEPARTMENTS.has(next.department)) {
      throw Error('Unknown voicemail department');
    }
    for (const score of [next.departmentConfidence, next.spamConfidence]) {
      if (score !== undefined && score !== null && (!Number.isFinite(score) || score < 0 || score > 1)) {
        throw Error('Invalid voicemail confidence');
      }
    }
    if (next.state === 'quarantined' && !next.quarantineExpiresAt) throw Error('Quarantine requires expiration');
    const values: Record<string, unknown> = { state: next.state };
    const mappings: Record<string, string> = {
      callerNumber: 'caller_number', contactId: 'contact_id', transcript: 'transcript',
      summary: 'summary', department: 'department', departmentConfidence: 'department_confidence',
      spamConfidence: 'spam_confidence', urgent: 'urgent', callbackRequested: 'callback_requested',
      recordingPath: 'recording_path', quarantineExpiresAt: 'quarantine_expires_at', lastError: 'last_error',
    };
    for (const [key, column] of Object.entries(mappings)) {
      if (Object.prototype.hasOwnProperty.call(next, key)) {
        values[column] = next[key as keyof typeof next];
      }
    }
    return (await this.store.updateWhere(identity(row), expectedState, values)).updated;
  }
}
