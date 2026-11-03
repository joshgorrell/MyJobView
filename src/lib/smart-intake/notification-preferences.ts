export type IntakeNotificationPreferences = { new_service_request: boolean; urgent_service_request: boolean; needs_review: boolean };
export const DEFAULT_INTAKE_NOTIFICATIONS: IntakeNotificationPreferences = { new_service_request: false, urgent_service_request: false, needs_review: false };
export type NotificationCategory = keyof IntakeNotificationPreferences;
export function shouldNotifyForIntake(preferences: IntakeNotificationPreferences | null | undefined, category: NotificationCategory): boolean {
  return Boolean(preferences?.[category]);
}
export function normalizeNotificationPreferences(input: Partial<IntakeNotificationPreferences>): IntakeNotificationPreferences {
  return { new_service_request: input.new_service_request === true, urgent_service_request: input.urgent_service_request === true, needs_review: input.needs_review === true };
}
