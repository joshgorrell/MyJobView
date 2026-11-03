export type ServiceIntakeNotificationPreference = {
  userId: string;
  organizationId: string;
  canAccessServiceCenter: boolean;
  notificationsEnabled: boolean;
  active: boolean;
};
export function serviceQueueVisibility(member: ServiceIntakeNotificationPreference, organizationId: string): boolean {
  return member.active && member.canAccessServiceCenter && member.organizationId === organizationId;
}
export function serviceIntakeNotificationRecipients(
  members: ServiceIntakeNotificationPreference[],
  organizationId: string
): string[] {
  return members.filter(member => serviceQueueVisibility(member, organizationId) && member.notificationsEnabled).map(member => member.userId);
}
export function shouldAutoAssignServiceRequest(): false {
  return false;
}
