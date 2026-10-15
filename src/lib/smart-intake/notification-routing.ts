export type IntakeNotificationKind = 'new_request' | 'urgent' | 'needs_review';
export type IntakeNotificationMember = { userId: string; departmentIds: string[]; canAccessServiceCenter: boolean; active: boolean };
export type IntakeNotificationSettings = { serviceDepartmentId: string; recipientUserIds: string[]; notifyKinds: IntakeNotificationKind[] };
export function resolveIntakeNotificationRecipients(members: IntakeNotificationMember[], settings: IntakeNotificationSettings, kind: IntakeNotificationKind): string[] {
  if (!settings.notifyKinds.includes(kind)) return [];
  const selected = new Set(settings.recipientUserIds);
  return members.filter(member => member.active && member.canAccessServiceCenter && member.departmentIds.includes(settings.serviceDepartmentId) && selected.has(member.userId)).map(member => member.userId);
}
export function canHandleServiceIntake(member: IntakeNotificationMember, departmentId: string): boolean {
  return member.active && member.canAccessServiceCenter && member.departmentIds.includes(departmentId);
}
