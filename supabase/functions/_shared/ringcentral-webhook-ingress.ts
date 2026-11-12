/**
 * RingCentral webhook ingress boundary. Authentication must run BEFORE
 * parsing/processing event bodies. Tenant is always resolved from a trusted
 * account/extension installation mapping, never from the webhook payload.
 */
export interface VoicemailEvent {
  accountId: string;
  extensionId: string;
  messageId: string;
}
export interface RingCentralWebhookEnvelope {
  event?: unknown;
  body?: unknown;
  ownerId?: unknown;
}
export interface WebhookRequest {
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}
export interface WebhookTenantResolver {
  resolve(accountId: string, extensionId: string): Promise<{ organizationId: string } | null>;
}
export interface VerifiedVoicemail {
  organizationId: string;
  accountId: string;
  extensionId: string;
  messageId: string;
}
export interface WebhookDecision {
  status: number;
  validationToken?: string;
  voicemail?: VerifiedVoicemail;
  reason?: string;
}
const MAX_TOKEN_LENGTH = 1024;
const MESSAGE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const EXTENSION_EVENT = /^\/restapi\/v1\.0\/account\/([^/]+)\/extension\/([^/]+)\/message-store(?:\/([^/?]+))?$/;

function parseEvent(value: unknown): VoicemailEvent | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as RingCentralWebhookEnvelope;
  if (typeof input.event !== 'string') return null;
  const match = EXTENSION_EVENT.exec(input.event);
  if (!match) return null;
  const body = input.body && typeof input.body === 'object' ? input.body as Record<string, unknown> : null;
  // RingCentral message-store notifications may include message id in body.id
  // or the event URL; never accept an unrelated caller-supplied identifier.
  const messageId = typeof body?.id === 'string' || typeof body?.id === 'number'
    ? String(body.id) : match[3];
  if (!messageId || !MESSAGE_ID.test(messageId)) return null;
  const [ , accountId, extensionId ] = match;
  if (!MESSAGE_ID.test(accountId) || !MESSAGE_ID.test(extensionId)) return null;
  // Message store notifications can include non-voicemail messages.
  // Dedicated /voicemail events may omit the message-store type field.
  if (!input.event.includes('/voicemail') && body?.type !== 'VoiceMail') return null;
  return { accountId, extensionId, messageId };
}
export async function validateRingCentralWebhook(
  request: WebhookRequest,
  expectedVerificationToken: string,
  resolver: WebhookTenantResolver,
): Promise<WebhookDecision> {
  if (!expectedVerificationToken || expectedVerificationToken.length > MAX_TOKEN_LENGTH) {
    throw Error('Webhook verification secret not configured');
  }
  const validationToken = request.headers.get('validation-token');
  if (validationToken !== null) {
    // Subscription validation challenge must be answered without ingesting.
    if (!validationToken || validationToken.length > MAX_TOKEN_LENGTH) return { status: 400 };
    return { status: 200, validationToken };
  }
  const signature = request.headers.get('verification-token');
  if (!signature || signature !== expectedVerificationToken) return { status: 401, reason: 'unauthorized' };
  let body: unknown;
  try { body = await request.json(); } catch { return { status: 400, reason: 'invalid_json' }; }
  const event = parseEvent(body);
  if (!event) return { status: 202, reason: 'ignored_event' };
  const tenant = await resolver.resolve(event.accountId, event.extensionId);
  if (!tenant?.organizationId) return { status: 403, reason: 'unknown_mailbox' };
  return { status: 202, voicemail: { ...event, organizationId: tenant.organizationId } };
}
