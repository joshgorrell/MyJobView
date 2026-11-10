# Reuse existing MJV private source read — no second change-order engine

## Located source

The repository already contains `techsafe_source.read_order_source(connection,order)` in
`supabase/migrations/20261031150238_techsafe_private_order_read_model.sql` (PR #397).
It returns a **single SQL-statement snapshot** of the bound current Sales Order,
its `proposal_line_items`, minimal product and exclusion facts, customer, all
change-order rows and change lines, and integration-owned application observations.
It is private, SECURITY INVOKER, with no API role execution grant. It is not a
new endpoint to build, nor is it a complete verified equipment snapshot.

The source read already returns the exact `order`, `customer`, `lines`,
`organizationId`, `currency`, and `minimumUnitValueCents` shape used by
`prepareOrderContent`. That existing helper delegates equipment classification,
exclusion and unit-value rules to `prepareSalesEquipment`.

## Critical unresolved authority

Every SQL source line intentionally sets `salesPriceResolved=false` and
`membership.verified=false`, with membership scope `unverified`. The read
contains change-order facts but does **not** certify whether all approved
applications have been applied correctly or establish net selling prices.
The private source fingerprint is diagnostic, not the revision ledger or
export certificate. Consequently, passing this raw SQL model directly to
`mjvCurrentEquipmentAdapter` must **fail closed**. The adapter now rejects
`readModelVersion===1` even when a caller claims trusted/approved flags.

## Next integration milestone

1. Reuse `read_order_source` for facts rather than implementing a second SQL
   change-order scanner or another change-order reducer.
2. Reuse the already-existing private application evidence, before/after
   equipment pairs and continuity checks (PRs #400/#401), and original
   customer approval evidence (PR #402). Establish a trusted original basis
   and complete current membership; do not infer approval from a header.
3. Resolve the stored product **unit selling price** according to MJV's
   existing rules, without applying project discounts or miscellaneous fees.
4. Under the same trusted SERIALIZABLE transaction, bind verified equipment
   to the current connection/tenant/revision, then persist an inert certificate.
   Preserve rollback on held or changed source.
5. Only after source parity and permission reviews should a separate approved
   sender/receiver workflow be considered. No live sync or coverage activation.

This is a code-level source discovery and a fail-closed guard, not a claim that
source membership or price verification is implemented. The existing SQL
function is STABLE and a single statement; it does not by itself establish
transaction-wide SERIALIZABLE certification. Avoid creating duplicate source
processing to compensate for missing verification.
