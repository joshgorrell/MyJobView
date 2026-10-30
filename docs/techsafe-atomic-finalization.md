# Opt-in atomic staff finalization

This migration builds on the retry-safe application engine. It adds a checked staff approval RPC that commits approval records, approved status, existing contract/tax trigger effects, equipment application, a managed order revision and a private outbox event in one transaction. Any error rolls back the whole transaction. Identical finalization retries return the saved result without replaying equipment changes or creating another event.

No registrations are seeded, existing UI callers are not redirected, and no network requests or Techsafe writes are introduced. Existing unregistered orders retain their current approval/application behavior. No production migration has been applied as part of this change.

## Authorization and workflow

`public.finalize_managed_change_order(change_order_id, approval_id, notes, portal_action)` requires an active same-organization admin, office manager or project manager. Approval steps must match the actor's role (admin may fulfill either staff role), belong to the CO, and follow required approval levels. Intermediate steps return `awaiting_approvals` and set pending approval status without applying equipment. Final approval requires an explicit keep/hide decision if the source proposal is visible in the customer portal.

Customer-required COs are refused until a trusted customer-evidence adapter exists, even if the browser-editable customer_approved flag is true. Proposal transfers also require a future adapter. Separately approved legacy COs cannot be retroactively certified through this endpoint.

Managed approval records cannot be written directly by browser roles. Managed approved headers, status transitions and deletion require a private transaction context inserted only by the checked function. A client-supplied configuration flag cannot manufacture that context. Trusted database maintenance remains possible and must not be used to bypass the managed workflow.

The legacy apply and reject functions refuse any order with a managed registration. This prevents a legacy CO on that same order from bypassing the managed serialization boundary. Existing unmanaged orders are unchanged. No live order may be opted in until all its creation, approval, rejection, amendment and portal callers are routed appropriately; simply registering an existing CO is unsafe.

## Event and revision limits

The outbox event contains source identities and revision, not an export-ready equipment snapshot. The revision covers this managed finalization path only; it is not yet a complete order-wide freshness guarantee. Direct source-line, proposal, product, customer and other relevant write paths still need revision participation or invalidation before export is enabled. This RPC does not depend on remote integration health, so source approvals can commit while Techsafe is unavailable and delivery can retry later.

The existing contract-total and tax guard triggers must be enabled. Their financial behavior remains in those existing functions rather than being duplicated in the RPC. The finalizer additionally uses the managed engine's mandatory totals calculation. Full-schema accounting, trigger interactions and multi-session concurrency validation remain required before pilot enablement.

## Validation and rollout

Run `node tests/techsafe/atomic-finalization.mjs`. The isolated PostgreSQL fixture verifies sequential role approvals, cross-tenant/inactive denial, unchanged retries, nonbillable/credit totals, equipment/tax/outbox rollback, portal decisions, customer-evidence refusal, direct-write denial, private tables, and legacy-path isolation. It uses minimal source tables and representative financial triggers; it does not replace full deployed-schema validation.

Keep registrations and consumers disabled until managed creation/routing, customer approval, amendments, complete committed snapshots, delivery and checkout freshness checks are ready. Do not erase receipts or revisions to retry uncertain applications. Before enablement, rollback consists of leaving the new endpoint unused; after any pilot data exists, retain its receipts and reconcile through an explicit migration.
