# Sales compensation arrangements — implementation contract

## Purpose
The payroll `employee_payroll_configs.compensation_type` is intentionally limited to `hourly` or `salary`. Do **not** add commission variants to that database enum or change the timekeeping basis to represent commission eligibility. Commission calculations already exist in `employee_commission_config`.

## New compensation arrangement (separate from time basis)
Create a versioned, effective-dated employee compensation arrangement linked to employee/user ID:
- `arrangement_type`: `hourly`, `salary`, `base_plus_commission`, `commission_only`
- `base_amount_cents` (>= 0), `base_frequency` (weekly/biweekly/semimonthly/monthly)
- `base_treatment`: `guaranteed_additional`, `recoverable_draw`, `nonrecoverable_draw`
- `effective_from`, `effective_to`, `created_by`, `updated_by`, timestamps
- For commission-only, base must be zero. For base plus commission, require a positive base and a treatment.
- Link to existing commission eligibility/configuration; do not duplicate commission rate rules.
- Enforce one effective arrangement per employee at any time. Preserve history on transitions.

## Accounting and payroll rules
- `guaranteed_additional`: base is additional to commission.
- `recoverable_draw`: commission earned offsets advances already paid, with a separately tracked carried balance; do not automatically deduct prior draws from gross wages without payroll/legal review.
- `nonrecoverable_draw`: base is a floor, not an advance to recover in later periods.
- Keep accrual, approved commissions, payments received, disbursements, and draw balances separate and auditable.
- Do not automatically post a second wage payment or change QuickBooks/Paylocity synchronization without verified mappings and reconciliation tests.
- Sales commissions continue to be calculated using existing commission settings; employee compensation arrangements only govern settlement.

## Add/Edit User interface
- Under Pay & Time, show `Compensation Arrangement` separately from existing `Hourly/Salary Time Basis`.
- When `Base + Commission` is selected, require base amount, frequency, and treatment; show commission eligibility/configuration status.
- When `Commission Only` is selected, hide base fields and show commission configuration.
- Provide red X on Pay & Time while required fields are missing; green check when complete. Optional sections remain unmarked.
- Save incomplete user profiles without attempting to activate incomplete payroll/compensation arrangements. Explicit activation is blocked until required fields are complete.
- For edits, do not block unrelated permissions/profile saves because of pre-existing missing payroll fields.
- Use one consistent Save Changes path and prevent losing unsaved edits.

## Aaron Koker intended configuration
- Arrangement: `base_plus_commission`
- Base: $500 weekly
- Treatment: `recoverable_draw` (subject to confirmation of applicable payroll rules)
- Commission rates and payout timing remain controlled by existing commission configuration.

## Acceptance tests
1. Existing hourly/salary employees continue unchanged.
2. Base+commission setup saves and loads with amount/frequency/treatment.
3. Commission-only setup saves without base.
4. Required-section indicators update live.
5. Payroll and commission settlements do not double-pay.
6. Effective-dated transitions preserve historical rates and balances.
7. Incomplete payroll blocks payroll activation, not unrelated edits.
8. Authorization, RLS, migrations, rollback, and reconciliation are tested before deployment.
