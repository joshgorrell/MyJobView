// Read-only classification for reconciliation previews; never authorizes a charge or ledger write.
// Only unambiguous invoice-only Payment records are supported here. Credits, mixed links,
// unapplied balances and corrections require separate reviewed accounting handling.
type PaymentLine = { Amount?: unknown; LinkedTxn?: readonly { TxnType?: unknown; TxnId?: unknown }[] };
type Payment = { TotalAmt?: unknown; UnappliedAmt?: unknown; Line?: readonly PaymentLine[] };
type Result = { ok: true; allocations: { invoiceId: string; principalCents: number }[] } | { ok: false; reason: string };

function cents(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const n = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
}

export function classifyInvoiceOnlyQboPayment(payment: Payment): Result {
  const total = cents(payment.TotalAmt);
  const unapplied = cents(payment.UnappliedAmt);
  if (total === null || total <= 0 || unapplied !== 0) return { ok: false, reason: 'unsupported_total_or_unapplied' };
  if (!Array.isArray(payment.Line) || !payment.Line.length) return { ok: false, reason: 'missing_lines' };
  const totals = new Map<string, number>();
  let sum = 0;
  for (const line of payment.Line) {
    const links = line?.LinkedTxn;
    const amount = cents(line?.Amount);
    if (!Array.isArray(links) || links.length !== 1 || links[0]?.TxnType !== 'Invoice'
      || typeof links[0].TxnId !== 'string' || !links[0].TxnId.trim() || amount === null || amount <= 0)
      return { ok: false, reason: 'ambiguous_or_unsupported_line' };
    const id = links[0].TxnId;
    sum += amount;
    if (!Number.isSafeInteger(sum)) return { ok: false, reason: 'amount_overflow' };
    totals.set(id, (totals.get(id) ?? 0) + amount);
  }
  if (sum !== total) return { ok: false, reason: 'total_mismatch' };
  return { ok: true, allocations: Array.from(totals, ([invoiceId, principalCents]) => ({ invoiceId, principalCents })) };
}
