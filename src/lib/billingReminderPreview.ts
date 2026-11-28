// Pure preview only. No delivery, persistence, or payment side effects.
export const DEFAULT_BILLING_TIMELINE = [-5, 0, 7, 15, 30, 45, 60] as const;

function dayNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Expected calendar date');
  const ms = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date');
  return ms / 86400000;
}

export interface BillingPreviewInvoice {
  id: string;
  dueDate: string | null;
  balanceCents: number;
  eligible: boolean; // Caller must establish visibility, settlement and hold eligibility.
  lastReminderOffset: number | null;
}

export function previewBillingReminder(invoice: BillingPreviewInvoice, asOf: string, offsets: readonly number[] = DEFAULT_BILLING_TIMELINE): number | null {
  if (!invoice.eligible || !invoice.dueDate || !Number.isSafeInteger(invoice.balanceCents) || invoice.balanceCents <= 0) return null;
  if (offsets.some(offset => !Number.isSafeInteger(offset))) throw new Error('Invalid reminder offset');
  const age = dayNumber(asOf) - dayNumber(invoice.dueDate);
  // Preview only the newest applicable stage; never replay earlier stages.
  const stage = [...offsets].filter(offset => offset <= age).sort((a, b) => b - a)[0];
  if (stage === undefined || (invoice.lastReminderOffset !== null && stage <= invoice.lastReminderOffset)) return null;
  return stage;
}
