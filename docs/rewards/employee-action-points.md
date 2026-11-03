# Employee action points

One action-based program extends the existing employee Rewards ledger, balance, catalog and redemption workflows. There are no role plans, employee points goals, enrollment, quarterly eligibility tests or quarterly awards. Customer/VIP points and commissions are unchanged.

## Calibration, not a points quota

The reference value is 10,000 points = $100. This calibrates earning opportunities; it does not pay cash or automatically reprice the existing catalog. Admins can adjust action values and reference value.

Electronic Life starting values:

| Action | Points |
| --- | ---: |
| First eligible early/on-time daily arrival | 77 |
| First clock-in to a distinct project/service job each day | 38 |
| Each pre-tax dollar of a recorded invoice payment | 0.04454699 |
| Administrator-verified customer review | 100 |
| Job photos/videos and other activities | Existing configurable values retained |

65 on-time days plus 130 distinct job clock-ins yield 9,945 points ($99.45 reference value). $224,482.04 in pre-tax collections yields approximately 10,000 points ($100). The collection example came from the existing sales goals, but goals are **not** inputs to the earning engine. All employees receive the same action rates. Additional photos, reviews, assignments and other eligible activities continue earning for anyone performing them. Actual totals differ with activity; there is no personal points cap or quarter-end gate.

The Admin → Points & Rewards → Points Configuration page includes editable invoice/job/review rules, reference value and an example earning-value check. Existing attendance, photo and other activity fields remain available on the same page. Employees see the current shared values under Earn Points. The attendance menu now reads the actual configured amounts instead of advertising hard-coded old values.

## Invoice payments

- Every newly recorded invoice payment can earn, including project/deposit/progress/final, service and other invoice types. Booking an order or setting an invoice status to paid alone earns nothing.
- Partial payments earn proportionally. Sales tax and payment convenience fees are excluded. Overpayments cannot earn above the invoice's pre-tax total. Fractional points accumulate across invoices; splitting a payment cannot lose fractional credit. Cumulative cents allocation prevents tiny payments from inflating tax-exclusive principal.
- The customer's owning employee is captured when payment is recorded. Later owner changes do not transfer existing points. Missing ownership/inactive/portal recipients are not guessed. This matches existing customer-portfolio attribution.
- Each payment snapshots the global rate in effect when recorded. Amount corrections/deletions and invoice total/tax changes, voids and reinstatements reconcile the original points at their original rate. Recorded payment date edits do not create a new earning event.
- Refunds/chargebacks must be reflected in MJV payment/invoice records. No unsupported processor-refund source is invented. A rewarded payment's invoice, organization and identity cannot be moved; reverse it and record the corrected payment instead.
- No historical payment backfill is performed. Existing payments consume their share of invoice principal but do not acquire new points during later invoice edits. Collections are recognized when recorded; future/backdated bookkeeping dates do not manufacture a second award.

## Job clock-ins and shared reviews

A valid native job clock-in earns immediately, regardless of employment type. Return punches to the same job on the same date earn once. Project work orders use the project as the canonical job; separate service visits use their work order. Unlinked/shop/training/customer-activity/rejected time does not qualify. Rejection/deletion/target corrections reverse or reconcile existing points. New awards snapshot the configured value, while restoring the same job/day uses its original value.

New job entries are captured only while this action is enabled and the job value is nonzero. Historical entries, and entries created while awards were paused or zero, are not backfilled when settings change. Existing attendance/PTO/holiday workflows remain authoritative for punctuality.

A review request marked completed still requires an administrator to verify the actual review, record individual-review evidence and select the credited employee. A sent request/link click alone cannot award points. A request/evidence reference can be rewarded once, with reload-safe identical retries. All active employee roles can receive recognition; portal/customer accounts cannot.

## Configuration and release

Zero disables a specific action. The action toggle pauses new invoice/job/review awards while existing activity rules and corrections to already-earned awards continue. Value changes apply to new captured actions; they do not reprice history. The migration seeds Electronic Life's new action values and changes its early/on-time amounts to 77. Existing late deductions, photo values, balances, ledger history, catalog and other companies' settings are retained. Other companies must explicitly enable new action awards.

Apply the new migration before frontend publication. No production migration or settings change was performed by this code implementation; no points were issued during development.

Validation covers action values across roles, actual ledger accounting, partial payments, tax/fees, overpayment, rate changes/refunds, no backfill, job clock deduplication/reversals, paused/zero values, admin/company boundaries, review retries and attendance-menu consistency. PostgreSQL CI additionally races invoice payments/shared balances, job punches and review retries, and checks rollback after injected ledger failure. Browser tests exercise real shared employee/admin components at 320/390/768/1440, zero values, review awards, earning examples and load/save error recovery.
