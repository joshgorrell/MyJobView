import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const paymentMigration = readFileSync('supabase/migrations/20261016145000_separate_payment_convenience_fee.sql','utf8');
const commissionMigration = readFileSync('supabase/migrations/20261016150000_commission_exclude_tax_card_fees.sql','utf8');
const form = readFileSync('src/components/Invoices/RecordPaymentModal.tsx','utf8');

test('recorded payment preserves gross charge and separately records fee',()=>{
  assert.match(form,/amount:\s*totalWithFee/);
  assert.match(form,/convenience_fee_amount:\s*convenienceFee/);
});
test('invoice status uses payment principal rather than gross charge',()=>{
  assert.match(paymentMigration,/SUM\(amount - convenience_fee_amount\)/i);
  assert.match(paymentMigration,/convenience_fee_amount >= 0 AND convenience_fee_amount <= amount/);
});
test('commission basis uses subtotal and excludes structured fees',()=>{
  assert.match(commissionMigration,/p_invoice\.subtotal - v_fee/);
  assert.match(commissionMigration,/credit_card_fee_amount/);
  assert.match(commissionMigration,/v_basis_amount := public\.commissionable_invoice_amount\(NEW\)/);
});
test('fee must not be subtracted from invoice basis twice',()=>{
  assert.doesNotMatch(commissionMigration,/payments\.convenience_fee_amount/);
});
