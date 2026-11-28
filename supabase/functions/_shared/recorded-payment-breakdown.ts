export function recordedPaymentBreakdown(amount: unknown, fee: unknown) {
  const grossAmount = Number(amount);
  const recordedFee = Number(fee ?? 0);
  if (amount == null || !Number.isFinite(grossAmount) || !Number.isFinite(recordedFee) || grossAmount < 0 || recordedFee < 0 || recordedFee > grossAmount) throw new Error('Invalid recorded payment amount');
  const appliedAmount = Math.round((grossAmount-recordedFee)*100)/100;
  return {grossAmount, recordedFee, appliedAmount};
}

/** Sum persisted ledger rows, never client-supplied receipt totals. */
export function recordedBulkPaymentBreakdown(rows: readonly { amount: unknown; convenience_fee_amount?: unknown }[]) {
  if (!rows.length) throw new Error('No recorded payments');
  let grossCents = 0;
  let feeCents = 0;
  for (const row of rows) {
    const { grossAmount, recordedFee } = recordedPaymentBreakdown(row.amount, row.convenience_fee_amount);
    const gross = Math.round(grossAmount * 100);
    const fee = Math.round(recordedFee * 100);
    if (!Number.isSafeInteger(gross) || !Number.isSafeInteger(fee)
      || Math.abs(grossAmount * 100 - gross) > 1e-6 || Math.abs(recordedFee * 100 - fee) > 1e-6
      || gross <= 0 || fee >= gross) throw new Error('Invalid recorded bulk payment cents');
    grossCents += gross;
    feeCents += fee;
    if (!Number.isSafeInteger(grossCents) || !Number.isSafeInteger(feeCents)) throw new Error('Bulk payment total out of range');
  }
  return { grossAmount: grossCents / 100, recordedFee: feeCents / 100, appliedAmount: (grossCents - feeCents) / 100 };
}
