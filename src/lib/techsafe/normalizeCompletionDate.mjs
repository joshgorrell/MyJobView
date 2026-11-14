// Normalize trusted PostgreSQL completion timestamps for Techsafe's
// calendar-month purchase deadline. Never accept an unverified client date.
export function normalizeTechsafeCompletionDate(value) {
  const date = value instanceof Date ? value :
    typeof value === 'string' && value.trim() ? new Date(value) : null;
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
