/** Statement delivery is separate from the method used to collect payment. */
export const PAPER_STATEMENT_FEE_PER_MAILING = 5;

export interface SecurityStatementBilling {
  mailedPaperStatements: boolean;
  paymentMode: 'autopay' | 'mail';
  monitoringMonthly: number;
}

export function securityStatementBilling(input: SecurityStatementBilling) {
  if (input.paymentMode === 'mail' && !input.mailedPaperStatements) {
    throw new Error('Manual billing requires mailed paper statements');
  }
  if (!Number.isFinite(input.monitoringMonthly) || input.monitoringMonthly < 0) {
    throw new Error('Invalid monitoring amount');
  }
  const paperFeeMonthly = input.mailedPaperStatements ? PAPER_STATEMENT_FEE_PER_MAILING : 0;
  return {
    electronicStatementsIncluded: true,
    autopayRequired: input.paymentMode === 'autopay',
    paperFeeMonthly,
    monthlyTotal: Math.round((input.monitoringMonthly + paperFeeMonthly) * 100) / 100,
    paperFeeAnnual: paperFeeMonthly,
  };
}

/** Apply annual discount only to monitoring, never the paper delivery add-on. */
export function securityAnnualStatementTotal(
  monitoringMonthly: number,
  mailedPaperStatements: boolean,
  discount: { type: 'percentage' | 'flat'; value: number },
) {
  const billing = securityStatementBilling({ monitoringMonthly, mailedPaperStatements, paymentMode: 'autopay' });
  if (!Number.isFinite(discount.value) || discount.value < 0) throw new Error('Invalid discount');
  const monitoringAnnual = Math.round(monitoringMonthly * 1200) / 100;
  const savings = discount.type === 'percentage'
    ? Math.round(monitoringAnnual * Math.min(discount.value, 100)) / 100
    : Math.min(discount.value, monitoringAnnual);
  return {
    monitoringAnnual,
    savings,
    paperFeeAnnual: billing.paperFeeAnnual,
    total: Math.round((monitoringAnnual - savings + billing.paperFeeAnnual) * 100) / 100,
  };
}
