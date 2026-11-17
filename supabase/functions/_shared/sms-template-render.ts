// Server-only SMS template rendering. No Twilio calls or queue writes.
// Callers must independently enforce dealer ownership, opt-in, suppression and feature flags.
export type SmsTemplateCategory = 'appointment_reminder' | 'review_request' | 'proposal_notification';
const allowed: Record<SmsTemplateCategory, readonly string[]> = {
  appointment_reminder: ['customer_name', 'appointment_date', 'appointment_time', 'company_name'],
  review_request: ['customer_name', 'company_name', 'review_link'],
  proposal_notification: ['customer_name', 'company_name', 'proposal_link'],
};
const tokenPattern = /\{([^{}]+)\}/g;
const maxLength = 1600;

export function renderSmsTemplate(
  category: SmsTemplateCategory,
  template: string,
  values: Record<string, string>,
): string {
  if (!Object.prototype.hasOwnProperty.call(allowed, category)) throw new Error('Invalid SMS category');
  if (typeof template !== 'string' || !template.trim() || template.length > maxLength)
    throw new Error('Invalid SMS template');
  const tokens = [...template.matchAll(tokenPattern)].map(match => match[1]);
  // Reject malformed braces instead of allowing unresolved template fragments to be sent.
  const withoutTokens = template.replace(tokenPattern, '');
  if (/[{}]/.test(withoutTokens)) throw new Error('Malformed SMS placeholder');
  for (const token of tokens) {
    if (!allowed[category].includes(token)) throw new Error('Unsupported SMS placeholder');
    const value = values[token];
    if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value))
      throw new Error('Missing or invalid SMS placeholder value');
    if (token.endsWith('_link')) {
      let parsed: URL;
      try { parsed = new URL(value); } catch { throw new Error('Invalid SMS link'); }
      if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password)
        throw new Error('SMS links must use HTTPS without credentials');
    }
  }
  const rendered = template.replace(tokenPattern, (_, token: string) => values[token]);
  if (!rendered.trim() || rendered.length > maxLength) throw new Error('Rendered SMS exceeds limit');
  return rendered;
}
