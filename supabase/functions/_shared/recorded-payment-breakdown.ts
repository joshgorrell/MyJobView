export function recordedPaymentBreakdown(amount: unknown, fee: unknown) {
  const grossAmount = Number(amount);
  const recordedFee = Number(fee ?? 0);
  if (amount == null || !Number.isFinite(grossAmount) || !Number.isFinite(recordedFee) || grossAmount < 0 || recordedFee < 0 || recordedFee > grossAmount) throw new Error('Invalid recorded payment amount');
  const appliedAmount = Math.round((grossAmount-recordedFee)*100)/100;
  return {grossAmount, recordedFee, appliedAmount};
}
