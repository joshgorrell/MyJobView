import type { SecurityDraftForm } from './securityOnboarding';

// Explicit fields only. Do not spread form data: old drafts may contain paymentDetails.
export function safeSecurityDraft(form: SecurityDraftForm, billingPreference: 'monthly' | 'annual') {
  return {
    personalInfo: { full_name: form.personalInfo.full_name, email: form.personalInfo.email, phone: form.personalInfo.phone },
    propertyInfo: { address_line1: form.propertyInfo.address_line1, city: form.propertyInfo.city,
      state: form.propertyInfo.state, zip_code: form.propertyInfo.zip_code },
    emergencyContacts: form.emergencyContacts.map(c => ({ name: c.name, phone: c.phone,
      password: c.password, canAuthorize: Boolean(c.canAuthorize) })),
    paymentMethod: form.paymentMethod,
    paymentMethodId: form.paymentMethodId,
    billingPreference,
  };
}

export function restoredSecurityStep(step: number): number {
  // A signature is never saved to a draft, so a returning customer reviews and signs again.
  return Math.min(6, Math.max(1, Number.isInteger(step) ? step : 1));
}
