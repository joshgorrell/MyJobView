# Commissionable invoice basis review

For project invoice commission records, the invoice's **subtotal** is the starting point, rather than its tax-inclusive total. A linked, same-organization tax snapshot provides the structured credit-card fee deduction; without one, classified invoice credit-card fee lines provide the deduction. The result is used for both sales and project-manager commission records; existing role-specific rates and payment-based accrual remain unchanged.

The migration intentionally does **not** rewrite existing commission records. Review any records created before deployment separately.

## Acceptance examples

| Invoice subtotal | Sales tax | Structured card fee | Commission basis | 7% commission |
| ---: | ---: | ---: | ---: | ---: |
| $10,000 | $900 | $300 | $9,700 | $679 |
| $10,000 | $900 | $0 | $10,000 | $700 |

## Required follow-up before deployment

- Confirm the tax snapshot fee is included in invoice subtotal, and is not already excluded by invoice accounting.
- Confirm the invoicing flow consistently links the correct snapshot and fee, and that invoice fee lines and snapshot amounts agree when both exist.
- Validate invoices without snapshots, including cases where card fees are added later at payment time.
- Verify partial payment accrual and actual commission payability with realistic fixtures.
- Review legacy invoice commission records before any backfill.

**Safety:** Do not deploy this migration until the snapshot/subtotal assumptions are verified. It is deliberately strict about invalid data, but a missing snapshot with an unmarked fee could still overstate the basis.

## Verified payment-time fee blocker (2026-10-16)

`RecordPaymentModal.tsx` inserts `payments.amount = paymentAmount + convenienceFee` and stores the fee amount only in free-text notes. Its own follow-up invoice update uses `paymentAmount` (without the fee).

However, the live database function `update_invoice_payment_status()` independently calculates `SUM(payments.amount)` and writes that gross value into `invoices.amount_paid`. Both the payment-side commission trigger and the invoice-side commission trigger depend on `invoices.amount_paid / invoices.total`. Thus, fee-inclusive payments can make an invoice appear paid too early, especially on partial payments. The existing invoice UI update is not a durable solution because the database trigger runs automatically.

**Do not merge/deploy until the payment amount semantics and integration tests are verified.** The recommended separate change is a structured `payments.convenience_fee_amount` column (default zero, constrained between zero and `amount`), populated at payment recording, with invoice payment status computed from `SUM(amount - convenience_fee_amount)`. Confirm QuickBooks reconciliation, processor charges, security-billing payment flows, and historical notes before backfilling. Do not parse notes to silently alter existing payment records.

The convenience fee charged at payment time is not included in invoice subtotal and must **not** be deducted a second time from the commission basis.

## Proposed payment-accounting fix in this PR

The payment entry form now writes a structured `convenience_fee_amount` alongside the full processor charge. The preceding migration adds this column and updates the invoice payment-status trigger to sum only `amount - convenience_fee_amount`. Existing rows default to zero; no historical notes are parsed or altered.

**Not yet validated:** other payment entry points (QuickBooks synchronization, security billing), refund handling, receipt presentation, trigger order, and database integration tests. No production deployment until these are checked.
