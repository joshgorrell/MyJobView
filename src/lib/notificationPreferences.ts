export const notificationOptions = [
  { key: 'notify_on_mention', title: 'Mentions', description: 'When a teammate mentions you with @ in a discussion.' },
  { key: 'notify_on_lead_assigned', title: 'Lead assignments', description: 'When a lead is assigned to you.' },
  { key: 'notify_on_fishbowl', title: 'New fishbowl leads', description: 'When a new lead is available in the fishbowl.' },
  { key: 'notify_on_escalated', title: 'Lead escalations', description: 'When a lead is escalated.' },
  { key: 'notify_on_lead_status', title: 'Priority lead updates', description: 'When your High or Urgent leads are claimed or change status.' },
  { key: 'notify_on_product_requests', title: 'Product requests', description: 'Email updates when product or parts requests are submitted for purchasing.' },
] as const;
export type NotificationPreferences = Record<typeof notificationOptions[number]['key'], boolean>;

export function readNotificationPreferences(profile: Partial<NotificationPreferences>): NotificationPreferences {
  return Object.fromEntries(notificationOptions.map(option => [option.key, profile[option.key] ?? true])) as NotificationPreferences;
}
