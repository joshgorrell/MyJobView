/** Shared contact follow-up criteria across lead, service, and support intake. */
export interface ContactCompletenessInput {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}
export function missingContactFields(contact: ContactCompletenessInput): string[] {
  const fields: [keyof ContactCompletenessInput, string][] = [
    ['full_name', 'Name'], ['phone', 'Phone'], ['email', 'Email'],
    ['street_address', 'Street address'], ['city', 'City'],
    ['state', 'State'], ['zip_code', 'ZIP code'],
  ];
  return fields.filter(([key]) => !contact[key]?.trim()).map(([, label]) => label);
}
export function isContactIncomplete(contact: ContactCompletenessInput): boolean {
  return missingContactFields(contact).length > 0;
}
