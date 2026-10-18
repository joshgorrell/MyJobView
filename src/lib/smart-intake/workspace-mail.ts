export type WorkspaceInbound = { originalMessageId?: string | null; forwardedMessageId?: string | null; from?: string | null; to?: string[] | null; subject?: string | null };
export function normalizeMessageId(value: string | null | undefined): string | null {
  const id = (value ?? '').trim().replace(/^<|>$/g, '').toLowerCase();
  return id || null;
}
export function determineWorkspaceDedupIdentity(mail: WorkspaceInbound): string | null {
  return normalizeMessageId(mail.originalMessageId) ?? normalizeMessageId(mail.forwardedMessageId);
}
export function isIntakeLoop(from: string | null | undefined, configuredSenderAddresses: string[]): boolean {
  const sender = (from ?? '').trim().toLowerCase();
  return Boolean(sender && configuredSenderAddresses.some(address => address.trim().toLowerCase() === sender));
}
