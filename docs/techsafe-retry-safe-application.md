# Opt-in change-order application engine

This PR depends on removal-provenance PR #380. It adds an internal engine and private application receipts. It does not redirect any existing approval screen, public applier or portal endpoint, create registrations, export equipment, or enable synchronization. Existing orders continue using their current flow.

## Stable application identities

The future atomic creation/finalization flow must register its own newly created change orders in managed_change_orders. The table has no browser grants or registration RPC. Missing registration causes the engine to refuse application. Do not adopt a legacy change order by simply inserting a registration: its prior application history may be unknown. New registrations must be created transactionally with the new managed CO, after approval/finalization routing is ready.

Every source change-order line receives a stable application mapping. Two additions with identical product, quantity, description and price produce two distinct equipment lines. The engine never deduplicates legitimate additions by comparing those business values. A completed application stores the exact source payload and returned line mappings. Identical retries return duplicate without replaying any quantity, price, labor, removal or calculation work. An old retry therefore cannot overwrite equipment changed by a later CO.

Changed applied payloads fail closed. Unlocking, rejecting or deleting an already-applied managed CO invalidates its receipt; changing it back to approved does not allow reuse. A future versioned amendment flow must define that behavior explicitly. These restrictions apply only to this opt-in engine, not to current public approval/application paths.

## Transactions and authorization

The function is SECURITY INVOKER in techsafe_source with an empty search_path and no browser execute grant. Its tables have RLS and no browser privileges. A future scoped trusted wrapper must authenticate the actor and authorize approval; this engine additionally checks active same-organization membership and registration/source/proposal/product/target relationships. An internal function is not a substitute for approval authorization.

It locks sales order, change order, then existing source lines. The deployed non-deferrable source-line parent FK was verified read-only; the migration checks that this locking prerequisite exists. Managed calls for the same order serialize, and partial source changes cannot commit while their locked rows are being applied. Multi-session concurrency validation against the full deployed schema remains required.

Equipment changes, per-line mappings, removal receipts, final calculations and application receipt commit together. If any action or calculation fails, the entire application rolls back. Totals calculation is mandatory rather than silently ignored. The live calculate_proposal_totals(uuid) signature was verified read-only. Unsupported actions and malformed nonnegative quantity/price/labor values fail closed. The established no per-line scope mutation for modify_modifiers is retained; the future finalizer must coordinate order headers, tax and modifiers.

The invalidation trigger changes only private receipt state when an approved CO leaves approved status or is deleted. It does not alter the source row or grant new approval permissions. No application receipts or managed registrations are seeded by migration, so there is no enabled source workflow yet.

## Required before wiring into live approvals

- Route approval status, approvals, billing/header adjustments, equipment application, committed revision and outbox recording through one authorized transaction.
- Ensure all relevant callers use that boundary. Prevent the legacy applier from separately applying a registered managed CO; this PR does not yet replace or guard that legacy entry point.
- Coordinate legacy and managed COs on the same order; mixed legacy paths do not participate in the new sales-order lock protocol.
- Define versioned reapproval/amendments, room/parent/accessory mapping and any additional CO fields before changing existing behavior.
- Prove final totals/taxes, manual/email/portal approval, existing triggers and cross-tenant permissions against the complete test database.
- Keep imports and checkout disabled until full committed revision exports and freshness checks are complete.

## Tests and rollback

Run node tests/techsafe/retry-safe-application.mjs. Isolated PostgreSQL tests apply both new migrations and run eight sequential COs, identical additions, stable mappings, harmless old retries, quantity/price/labor changes, removal evidence, registration/tenant/value rejection, partial-action and calculation rollback, changed-payload conflicts, lifecycle invalidation and private permissions.

The fixture uses a minimal totals function and source schema; it does not certify full accounting or real multi-session behavior. No production migration or existing workflow change has been deployed. Rollback before wiring consists of leaving the engine unused; retain receipts if any trusted pilot later creates them. Do not erase application identities to retry an uncertain application.
