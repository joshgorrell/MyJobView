# PM allowance within quoted labor

The allowance is a split of quoted hours: field target = quoted hours ×
(1 − PM percent / 100); PM allowance = quoted hours − field target.
At Electronic Life's existing 5%, 100 quoted hours is 95 field + 5 PM.
This is distinct from proposal PM dollar modifiers and bonus payout splits.

## Configuration and history

The existing Test & Tune → PM Allocation control uses company-scoped RPCs.
Only the dealer admin may change its percentage (0–50%). Changes are effective
today or on a future date, recorded with company, actor and reason. New orders
snapshot the allocation; changing the default does not recalculate existing
orders or approved bonuses. Change orders use the parent order's allocation.
This deliberate behavior protects previously agreed project targets.

The legacy global settings row is retained for compatibility with other
Test & Tune settings. Its PM field is no longer the source of truth. The migration
inherits its PM value only in a one-organization workspace; other organizations
start at 5%. Other global Test & Tune settings need a separate tenancy audit.

## Calculation paths

- Project overview and phase budgets use the order's saved percentage.
- Sales-order project view, completion and Test & Tune status use that split.
- Change-order target recalculation and bonus evaluation use the saved percentage.
- A missing mapping for the Project Management phase is inserted as excluded
  from field performance. Existing explicit mappings are preserved for review.
- Recorded hours and quoted hours are not rewritten by migration. Existing
  PM allocations are inferred from saved PM/quoted hours when available.

## Release

Apply `20261021125521_dealer_pm_allocation.sql` together with the frontend.
The new frontend requires its RPCs/columns. The old frontend retains the old
global PM control, so do not leave a database-only rollout as the final state.
Verify Electronic Life remains 5%, PM mapping is excluded, and an order's
field/PM targets sum to its quote. No historical bonus recalculation is run.

Checks: `node tests/projects/pm-allocation.mjs`,
`node tests/projects/runtime.mjs`, `npm run build`.
