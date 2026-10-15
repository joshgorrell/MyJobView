/**
 * Build a deterministic, tenant-scoped temporary object key.
 * Never incorporate user-supplied filenames or MIME types into object paths.
 */
export function quarantineObjectKey(organizationId: string, intakeId: string, attachmentId: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const providerId = /^[a-zA-Z0-9_-]{1,255}$/;
  if (!uuid.test(organizationId) || !uuid.test(intakeId) || !providerId.test(attachmentId)) {
    throw new Error("Invalid quarantine object identity");
  }
  return `${organizationId}/${intakeId}/${attachmentId}`;
}
