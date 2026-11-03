export interface SmartIntakeChannels {
  emailEnabled: boolean;
  emailAddress: string | null;
  emailVerified: boolean;
  smsEnabled: boolean;
  smsNumber: string | null;
  smsProvider: string | null;
  smsVerified: boolean;
}

export function canActivateEmailIntake(settings: SmartIntakeChannels): boolean {
  return settings.emailEnabled && settings.emailVerified && Boolean(settings.emailAddress?.trim());
}

export function canActivateSmsIntake(settings: SmartIntakeChannels): boolean {
  return settings.smsEnabled && settings.smsVerified && Boolean(settings.smsNumber?.trim()) && Boolean(settings.smsProvider?.trim());
}

export function enabledIntakeChannels(settings: SmartIntakeChannels): Array<'email' | 'sms'> {
  const enabled: Array<'email' | 'sms'> = [];
  if (canActivateEmailIntake(settings)) enabled.push('email');
  if (canActivateSmsIntake(settings)) enabled.push('sms');
  return enabled;
}
