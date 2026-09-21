export interface ConvenienceFeeSettings {
  cc_convenience_fee_enabled: boolean | null;
  cc_convenience_fee_type: string | null;
  cc_convenience_fee_percentage: number | null;
  cc_convenience_fee_flat_amount: number | null;
  cc_convenience_fee_label: string | null;
}

export interface ConvenienceFeeResult {
  feeAmount: number;
  totalWithFee: number;
  label: string;
  applies: boolean;
}

export const DEFAULT_FEE_LABEL = 'Credit Card Convenience Fee';

export function calculateConvenienceFee(
  paymentAmount: number,
  paymentMethod: string,
  settings: ConvenienceFeeSettings | null
): ConvenienceFeeResult {
  if (!settings?.cc_convenience_fee_enabled || paymentMethod !== 'credit_card') {
    return { feeAmount: 0, totalWithFee: paymentAmount, label: '', applies: false };
  }

  const label = settings.cc_convenience_fee_label || DEFAULT_FEE_LABEL;

  if (settings.cc_convenience_fee_type === 'flat') {
    const fee = Number(settings.cc_convenience_fee_flat_amount) || 0;
    return { feeAmount: fee, totalWithFee: paymentAmount + fee, label, applies: true };
  }

  const percent = Number(settings.cc_convenience_fee_percentage) || 0;
  const fee = Math.round(paymentAmount * percent * 100) / 100;
  return { feeAmount: fee, totalWithFee: paymentAmount + fee, label, applies: true };
}

export function formatFeeLine(result: ConvenienceFeeResult): string {
  if (!result.applies) return '';
  return `${result.label}: +$${result.feeAmount.toFixed(2)}`;
}
