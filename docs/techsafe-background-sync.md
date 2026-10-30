# Workflow preservation review and background sync plan

## Decision

Techsafe integration must preserve existing MJV creation, approval, portal, change-order, rejection, unlock, deletion, transfer, billing and tax behavior. It may read committed source data; it must not introduce a replacement approval system or make normal source transactions depend on Techsafe bookkeeping, connectivity or availability.

PR #382 is withdrawn and must not be deployed. It would have required new approval routing and blocked existing apply/reject calls on managed orders. Its tests proved its own transaction behavior, not equivalence to all existing MJV workflows.

The corrective migration detaches the private removal/restoration calls added by #380 from the existing public applier/rejector. It also removes the unused managed receipt-invalidation triggers added by #381. Private evidence tables/functions remain for history, but the managed engine must stay unused: no registration, activation or live caller is introduced. Do not treat its retained receipts or the old membership helper as a complete freshness certificate.

## Observed source behavior

Reviewed at main commit 25940071a273951563918e07f19b745498d712b2:

| Source | Existing behavior to preserve | Sync implication |
| --- | --- | --- |
| Production/ChangeOrderApprovalFlowModal.tsx, handleManualApprove | Saves approved header, may save contract total, then separately calls apply_change_order | Approved status alone is not proof of applied equipment |
| Production/ChangeOrderApprovalModal.tsx, handleApprove/finalizeApproval | Saves individual steps, checks remaining approvals, offers portal decision, saves CO/contract then calls applier | Intermediate committed states can be observed; never publish them as a verified quote |
| Sales/SalesOrderChangeOrdersTab.tsx | Calls unlock, restores proposal snapshots, recalculates totals and offers approved-CO deletion | Sync must detect reopening, restoration and deletion, not only additions |
| Sales/TransferChangeOrderModal.tsx | Uses transfer_change_order_to_proposal | Follow actual current order/proposal binding; do not rewrite transfer behavior |
| #380 removal foundation | Recording helpers can raise inside existing apply/reject transactions | Detach hooks so integration errors cannot change normal MJV outcomes |
| #381 managed engine | No current registrations/callers, but invalidation triggers attach to source table | Remove source triggers and keep engine unused |

This is a repository-level review, not certification of every deployed caller, portal endpoint, trigger or accounting rule. Full caller inventory is required before activation.

## Revised implementation sequence

1. Merge workflow isolation; validate cumulative migrations against a full schema clone and compare public function bodies/privileges with the pre-integration versions. Run normal manual, sequential, customer/portal, rejection, unlock/reapproval, deletion, transfer, billing and tax scenarios. Confirm production migration history read-only before choosing any rollout sequence.
2. Build a scoped server-side read model. Read order, customer, current proposal scope, all relevant COs/source lines, catalog exclusions and connection generation in one consistent database snapshot. Do not infer equipment membership from presentation is_hidden, infer application from approved status, replay COs into the source, or merge identical legitimate equipment rows.
3. Resolve application evidence without changing source workflows. Audit existing transaction boundaries and available durable evidence for each action. Repeated matching reads or a quiet time window are insufficient: an approved CO can have failed application permanently. Where reliable evidence is absent or contradictory, withhold Techsafe certification and record an integration diagnostic. This evidence problem remains an explicit activation blocker; do not promise fully automatic current quotes until solved across all callers.
4. Use an external scheduled worker with bounded, indexed reads and durable checkpoints in integration-owned storage. Poll committed source state; no remote HTTP calls, outbox inserts, new guards or integration triggers in normal MJV transactions. Reconciliation must include deletes and settings/catalog/customer changes. Notifications may accelerate later polling but cannot be the only source of truth. Benchmark query load and failure behavior before rollout.
5. Build a complete eligible snapshot using existing product classifications, real product identity, sticky miscellaneous exclusion, per-product opt-out and inclusive minimum per-unit sale value. Exclude labor, tax, fees and miscellaneous placeholders regardless of price. Bind stable source identities, source fingerprint, tenant, connection generation and verified application evidence. These are requirements, not implemented by this corrective PR.
6. Deliver idempotently to one Techsafe draft per source order/connection. Reject obsolete generations and out-of-order snapshots; reconcile reconnects, pauses, revocations and removed orders. Never modify active coverage. A failed worker leaves MJV unaffected and Techsafe visibly unverified; do not silently show an old quote as current.
7. Automatically verify current source evidence before showing a quote as current and again before payment. If the source is unavailable, changing or ambiguous, block Techsafe purchase and retry automatically. Exact checkout behavior under concurrent MJV edits needs a documented version/freshness protocol and tests; polling alone cannot promise zero lag or eliminate a verification-to-payment race.
8. Pilot with explicit connection enablement after full-schema, cross-tenant, concurrency, load and outage checks. Only visible MJV additions are integration settings and the conditional product exclusion checkbox. Keep remote credentials/tokens server-side and the two databases independent.

## Validation of this corrective change

`node tests/techsafe/workflow-isolation.mjs` applies the original applier, the provenance foundation, the managed-engine migration and the corrective migration in isolated PostgreSQL. It compares original/restored apply and reject definitions (including security attributes), verifies managed invalidation triggers are absent, replaces both Techsafe recording helpers with functions that always fail, and confirms normal removal/rejection still succeed. Missing removal evidence remains unverified for Techsafe and private tables retain restricted privileges.

Earlier provenance tests cover the earlier migration in isolation; they are not evidence that hooks remain active after this corrective migration. The new cumulative test checks final isolation. No production database is modified by this PR; no sync worker, quote publishing or checkout is enabled.
