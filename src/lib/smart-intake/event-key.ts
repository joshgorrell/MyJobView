export type IntakeChannel = 'email' | 'sms' | 'mms';

/** A webhook retry must resolve to the same durable intake item. */
export function intakeEventKey(
  organizationId: string,
  channel: IntakeChannel,
  provider: string,
  providerEventId: string,
): string {
  if (!organizationId.trim() || !provider.trim() || !providerEventId.trim()) {
    throw new Error('Intake requires tenant, provider, and provider event ID');
  }
  return JSON.stringify([organizationId, channel, provider.trim(), providerEventId.trim()]);
}
