import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Contract tests for the billing helper's safety boundaries. Runtime integration
// tests must additionally exercise the database and QuickBooks invoice writer.
const source = await readFile(new URL('../../src/lib/securityStatementBilling.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../supabase/migrations/20261116160000_security_paper_statements_independent.sql', import.meta.url), 'utf8');

assert.match(source, /PAPER_STATEMENT_FEE_PER_MAILING = 5/);
assert.match(source, /Manual billing requires mailed paper statements/);
assert.match(source, /autopayRequired: input.paymentMode === 'autopay'/);
assert.match(source, /paperFeeAnnual: paperFeeMonthly,/);
assert.match(source, /monitoringAnnual \+ billing.paperFeeAnnual/);
assert.match(migration, /mailed_paper_statements boolean NOT NULL DEFAULT false/);
assert.match(migration, /security_billing_mode <> 'mail' OR mailed_paper_statements = true/);
assert.match(migration, /Only an Admin may change mailed paper statements/);
assert.match(migration, /OLD.customer_completed_at IS NOT NULL/);
assert.match(migration, /organization_id = NEW.organization_id AND role = 'admin'/);
assert.match(migration, /'mailedPaperStatements', CASE WHEN jsonb_typeof\(p_form->'mailedPaperStatements'\) = 'boolean'/);
assert.match(migration, /ELSE false END/);
assert.match(migration, /Signed billing terms cannot be changed without a new agreement/);
assert.match(migration, /NEW\.monthly_price := NEW\.monthly_price \+ v_desired_fee - v_prior_applied_fee/);
assert.match(migration, /NEW\.mail_invoice_fee := v_desired_fee/);
assert.match(migration, /v_prior_applied_fee := CASE WHEN NEW\.security_billing_mode = 'mail' THEN 5 ELSE 0 END/);
const worker = await readFile(new URL('../../supabase/functions/security-recurring-billing/index.ts', import.meta.url), 'utf8');
assert.match(worker, /contract\.mailed_paper_statements/);
assert.match(worker, /paperLines\.length!==1/);
assert.match(worker, /paperLines\.length!==0/);
assert.match(worker, /Paper statement fee itemization requires reconciliation/);
assert.match(worker, /feeAmount===5 && feeQuantity===1 && feeUnitPrice===5/);
assert.doesNotMatch(worker, /feeAmount===60/);
const signing = await readFile(new URL('../../supabase/migrations/20261116170000_security_paper_statement_signing.sql', import.meta.url), 'utf8');
const wizard = await readFile(new URL('../../src/components/Portal/OnboardingWizard.tsx', import.meta.url), 'utf8');
assert.match(signing, /mailed_paper_statements=\(v_form->>'mailedPaperStatements'\)::boolean/);
assert.match(signing, /'mailed_paper_statements',\(v_form->>'mailedPaperStatements'\)::boolean/);
assert.match(signing, /'mail_invoice_fee',CASE WHEN v_form->>'mailedPaperStatements'='true' THEN 5 ELSE 0 END/);
assert.match(migration, /NEW\.onboarding_agreement_snapshot->>'mailed_paper_statements'/);
assert.match(wizard, /checked=\{Boolean\(formData\.mailedPaperStatements\)\}/);
assert.match(wizard, /AutoPay enrollment is still required/);
const recurring = await readFile(new URL('../../supabase/migrations/20261116180000_security_paper_fee_recurring_invoices.sql', import.meta.url), 'utf8');
assert.match(recurring, /THEN 5 ELSE 0 END/);
assert.match(recurring, /mailed_paper_statements/);
assert.match(recurring, /\*v_months \+ v_fee/);
assert.match(recurring, /statement fee \(\$5 per statement\)/);
assert.match(recurring, /v_end,1,5,v_fee/);
assert.doesNotMatch(recurring, /v_months,7,v_fee/);
// Numeric scenarios mirror the SQL invoice calculation: annual billing
// charges for 12 months of monitoring but only one mailed statement.
function invoiceTotal(monthlyPrice, existingPaperFee, paperSelected, months) {
  const monitoring = (monthlyPrice - existingPaperFee) * months;
  const statementFee = paperSelected ? 5 : 0;
  return { statementFee, total: monitoring + statementFee };
}
assert.deepEqual(invoiceTotal(42, 0, false, 1), { statementFee: 0, total: 42 });
assert.deepEqual(invoiceTotal(42, 0, true, 1), { statementFee: 5, total: 47 });
assert.deepEqual(invoiceTotal(42, 0, false, 12), { statementFee: 0, total: 504 });
assert.deepEqual(invoiceTotal(42, 0, true, 12), { statementFee: 5, total: 509 });
assert.deepEqual(invoiceTotal(47, 5, true, 12), { statementFee: 5, total: 509 });
assert.doesNotMatch(recurring, /annual_discount_type|annual_discount_percentage|annual_discount_flat_amount|v_discount/);
assert.match(recurring, /c\.mailed_paper_statements,false/);
assert.doesNotMatch(wizard, /calculateAnnualDiscount|receive a discount/);
console.log('Statement billing source contract checks passed');
