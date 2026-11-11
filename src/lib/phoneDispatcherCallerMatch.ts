/**
 * Read-only caller matching for RingCentral voicemail intake.
 * Never creates or updates contacts. Ambiguous matches require human review.
 */
export interface PhoneContact {
  id: string;
  organization_id: string;
  phone?: string | null;
  mobile_phone?: string | null;
  business_phone?: string | null;
}

export type CallerMatch =
  | { kind: 'matched'; contactId: string }
  | { kind: 'unmatched' }
  | { kind: 'ambiguous'; contactIds: string[] }
  | { kind: 'invalid_number' };

/**
 * Conservative North American normalization. Other country formats are left
 * unmatched until a proper international number parser is integrated.
 * Extensions are not treated as part of the caller's telephone number.
 */
export function normalizeNorthAmericanPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const withoutExtension = trimmed.replace(/(?:\s*(?:ext\.?|extension|x|#)\s*\d+)$/i, '');
  if (!/^[+\d\s().-]+$/.test(withoutExtension)) return null;
  const digits = withoutExtension.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

export function matchVoicemailCaller(
  organizationId: string,
  callerNumber: string | null | undefined,
  contacts: readonly PhoneContact[],
): CallerMatch {
  if (!organizationId.trim()) throw new Error('Missing organization identity');
  const normalized = normalizeNorthAmericanPhone(callerNumber);
  if (!normalized) return { kind: 'invalid_number' };

  const matches = new Set<string>();
  for (const contact of contacts) {
    if (contact.organization_id !== organizationId) continue;
    if ([contact.phone, contact.mobile_phone, contact.business_phone].some(phone => normalizeNorthAmericanPhone(phone) === normalized)) {
      matches.add(contact.id);
    }
  }
  if (matches.size === 0) return { kind: 'unmatched' };
  if (matches.size === 1) return { kind: 'matched', contactId: [...matches][0] };
  return { kind: 'ambiguous', contactIds: [...matches].sort() };
}
