/** Unique delivery identity to avoid duplicate notices from repeated inbound webhooks. */
export function intakeNotificationEventKey(organizationId: string, intakeId: string, userId: string, category: string): string {
  if (![organizationId,intakeId,userId,category].every(Boolean)) throw new Error('Missing notification identity');
  return JSON.stringify([organizationId,intakeId,userId,category]);
}
