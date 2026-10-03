# Commission repair: first phase

October 3 clarification: [the dealer matrix specification](commission-matrix-spec.md) supersedes this phase's independent sales/design allocation model. This draft needs that implementation revision before it matches the requested commission policy.

This branch repairs new commission accrual and its reporting. It does not change company/employee rates, initiate bank/payroll payments, or apply a historical commission backfill.

## Behavior

- New invoices create revision-2 commission records. Existing records remain revision 1 with their original rates, recipients, basis and paid history.
- Project sales credit uses the sales order's assigned rep, then the project's salesperson. Proposal deposits can use `proposals.created_by`, which the proposal builder stores as its selected rep. An administrator creating a sales order does not receive its commission merely by creating the row.
- Eligible configured employees get the frozen role rate. Missing eligibility configuration does not imply eligibility. Explicit designers with automatic design credit and assigned PMs can earn separate configured roles, including when the same person serves multiple roles.
- Service invoices carry `commission_work_order_id` before invoice creation, so standalone and project-linked service invoices use service rates. The service department allocation uses the company's existing service PM rate and a department recipient with no employee ID; it is not an individual payroll payment.
- New records exclude sales tax, actual billed fee lines classified as `credit_card_fee`, and separately recorded payment convenience fees. No current-company fee percentage is guessed for historical payments.
- Payment and invoice triggers use their correct row IDs. Payments derive invoice balances server-side; the browser does not separately overwrite them with potentially stale totals. Both invoices are recalculated when a payment is moved. Refunds, including signed convenience-fee refunds, reduce earnings without rewriting the amount already paid to the employee.
- Recipient rates remain frozen on their existing records. Before any collection, role reassignment can replace uncollected recipient records. After collection or a recorded commission payout, attribution remains locked. Later deposit/project linkage updates source metadata without creating another commission.
- Profit-basis records are held at zero earned until verified costs are implemented. They cannot silently use invoice revenue as profit.
- The old service billing entry point now opens the canonical work-order invoice form. Combined work orders must have matching customers, projects and sales reps.

## Security

All earlier commission policies are removed before replacement. Financial records, payments, statements, batches and adjustments are client read-only. Active reps read their own records; active admin/finance/manager/sales-manager roles read their organization's management data. Company/employee configuration and project/report overrides have organization and related-record ownership checks. Private mutation helpers cannot be called by client roles. Source/payment validation rejects cross-organization links.

Invoice locks serialize collection processing. Source changes acquire related invoice locks in ID order. Reports restrict collection history to invoices with payments in the requested organization/date range and use an indexed payment-period lookup.

## Reporting

The earnings report uses the database's frozen rate/basis and payment dates. Rounded cumulative differences allocate each installment/refund so report earnings reconcile to the ledger. Invoice collections are counted once even when several roles earn commission. Weekly and 14-day payroll periods use an explicit start-date anchor, and twice-monthly/monthly periods default to the current period in the organization's timezone. The settings screen exposes the anchor.

The report displays earnings and approval state; it is not a payroll payout instruction. The former report-only rate/deduction editing has been removed from this view. Existing saved overrides and deductions are retained and produce a reconciliation warning. Historical revision-1 commissions with payments in the selected period are counted in a warning and excluded from the new report until reconciled. Legacy records still appear in All Records; future collections still accrue using their retained historical basis.

## Validation

- `npm run test:commissions`: executable PGlite SQL migration/regression tests use the audited schema's real financial table definitions and check invoice/payment triggers, assigned rep attribution, proposal deposits, standalone/project-linked service, department pool, fees and refunds, moved/deleted payments, overpayment/zero-total handling, rate locking, invoice updates, installment rounding, paid-balance preservation, missing eligibility, profit holds, source/tenant isolation, RLS and RPC permissions.
- The same test command checks payroll-period boundaries and report runtime behavior, including server-rounded earnings, receipt deduplication, visible errors and historical/adjustment warnings.
- Production frontend build passes. Focused lint on rewritten/new components passes.
- Before integrating the concurrent employee-time merge, repository-wide typecheck was compared with the audited base (`f362e14`): the base has 1,568 diagnostics; the commission branch had 1,539, with no new diagnostic messages. The repository still needs unrelated type cleanup.
- The concurrent employee-time change from `main` was integrated, preserving both test scripts; commission regression tests and the production build were rerun on the combined source.
- No production migration or production payment mutation was performed.

## Before merge/deployment

1. Apply `20261002161413_commission_accrual_repairs.sql` to an isolated staging copy, then test an actual UI payment and service invoice against the complete trigger graph. The local SQL fixture exercises the commission/payment graph, not every production notification, tax and deposit trigger.
2. Verify backend payment writers with representative Stripe/QBO/manual receipts. New manual single/bulk payments store explicit convenience fees; other writers must distinguish any out-of-invoice fees the same way when applicable.
3. Configure the real payroll start date if the company uses weekly or every-14-day payroll. Until then, choose custom report dates.
4. Review representative historical records, paid payroll, fee handling and saved report adjustments. Prepare a reconciliation preview before changing legacy financial values.
5. Apply the migration before deploying the frontend that expects its columns and report RPC; keep those releases coordinated.

## Following phase

Authorized approval/hold/reject actions; atomic commission payout recording with duplicate-payout protection and statements; auditable corrections; historical reconciliation; draw/advance balances and recovery; approved margin-tier/bonus/cap policies. Department allocations remain separate from individual payroll until a distribution policy is defined.
