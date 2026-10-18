export interface IntakeContact {
  id: string;
  organizationId: string;
  email?: string | null;
  phone?: string | null;
}
export type IntakeMatch =
  | { status: 'matched'; contactId: string }
  | { status: 'ambiguous'; contactIds: string[] }
  | { status: 'unmatched' };

export function normalizeIntakeEmail(value?: string | null): string | null {
  const email = value?.trim().toLowerCase();
  return email && email.includes('@') ? email : null;
}

export function normalizeIntakePhone(value?: string | null): string | null {
  const digits = value?.replace(/[^0-9]/g, '') ?? '';
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

/** No name-only automatic matches; a missing identifier never creates a contact. */
export function matchIntakeContact(
  organizationId: string,
  email: string | null,
  phone: string | null,
  contacts: IntakeContact[],
): IntakeMatch {
  const normalizedEmail = normalizeIntakeEmail(email);
  const normalizedPhone = normalizeIntakePhone(phone);
  const matches = contacts.filter(contact =>
    contact.organizationId === organizationId &&
    ((normalizedEmail !== null && normalizeIntakeEmail(contact.email) === normalizedEmail) ||
      (normalizedPhone !== null && normalizeIntakePhone(contact.phone) === normalizedPhone))
  );
  const ids = [...new Set(matches.map(contact => contact.id))];
  if (ids.length === 1) return { status: 'matched', contactId: ids[0] };
  if (ids.length > 1) return { status: 'ambiguous', contactIds: ids };
  return { status: 'unmatched' };
}
