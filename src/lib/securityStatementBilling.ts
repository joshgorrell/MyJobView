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

/** Annual billing is a payment frequency, not a discounted plan. */
export function securityAnnualStatementTotal(monitoringMonthly: number, mailedPaperStatements: boolean) {
  const billing = securityStatementBilling({ monitoringMonthly, mailedPaperStatements, paymentMode: 'autopay' });
  const monitoringAnnual = Math.round(monitoringMonthly * 1200) / 100;
  return { monitoringAnnual, paperFeeAnnual: billing.paperFeeAnnual, total: Math.round((monitoringAnnual + billing.paperFeeAnnual) * 100) / 100 };
}
