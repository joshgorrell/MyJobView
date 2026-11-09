# Techsafe approved Sales Order source: PostgreSQL concurrency verification

**Status:** Test plan only. No real database concurrency test has been executed. Do not deploy migration or enable live sync based on static CI.

## Preconditions

Use a disposable database with the exact MJV migration chain, including `sales_orders`, `proposal_line_items`, `change_orders`, `change_order_line_items`, `techsafe_source.integration_connections`, and `techsafe_source.order_revision_ledger`. Seed one active connection for a customer-approved Sales Order and a known revision/fingerprint. Run each scenario with two independent PostgreSQL sessions. Capture row versions, revisions, transaction IDs, errors, and final source counts. Verify tenant scoping and approval evidence using the actual application schema.

## Required concurrent schedules

| Case | Session A (reader) | Session B (writer) | Required outcome |
| --- | --- | --- | --- |
| New approved change order | Begin source inspection, pause after ledger lock | Insert approved change order and its lines, commit | Reader must not certify a snapshot omitting the new change; ledger must advance/hold |
| Pending to approved | Begin inspection | Update pending change to customer-approved, commit | No export before fresh approved scope and ledger revision are verified |
| Approval reversal | Begin inspection | Revoke customer approval, commit | No export of revoked equipment |
| Quantity mutation | Begin inspection | Modify a change-order line quantity, commit | No snapshot with old quantity under new revision |
| Line deletion | Begin inspection | Delete an approved change-order line, commit | Missing line cannot be silently accepted |
| Reparenting | Begin inspection | Move a change-order line between parent orders, commit | Both affected order ledgers held; no cross-tenant inclusion |
| Base proposal edit | Begin inspection | Update/delete/insert linked proposal line, commit | Reader must reject stale base equipment even without a change-order trigger |
| Connection rotation | Begin inspection | Disable or rotate integration generation, commit | Old generation cannot be certified or dispatched |
| Transaction rollback | Begin inspection | Mutate then roll back | No phantom persisted revision or certified change |
| Simultaneous writers | Begin inspection | Two competing writes on same order | Monotonic revisions; no deadlocks or lost increments |

## Gate before any positive authorization

1. Use a single database transaction with a demonstrated consistent view and a locking protocol shared by **all** relevant writers, including base proposal-line changes. Row-locking only connection and ledger is insufficient.
2. Confirm the actual schema and customer-signature semantics; `status='approved'` alone is not proof of customer approval.
3. Compare complete source row counts and identities, not caller-provided filtered arrays. Verify that source revisions cannot be reused or decreased.
4. Persist a canonical equipment snapshot and digest tied to tenant, connection generation, Sales Order, source revision, and verified approval evidence.
5. Revalidate that digest and the active connection immediately before authenticated dispatch. No network call should occur while holding a long-running database transaction.
6. Run integration and concurrency tests against PostgreSQL, plus cross-repository Techsafe receipt/claim tests, before requesting human approval for activation.

**Current function is diagnostic only:** it deliberately returns `valid:false`, `authorized:false`, and `snapshotReady:false`, even when it successfully inspects scope.
