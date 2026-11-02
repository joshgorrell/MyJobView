# Techsafe source verification: first implementation gate (2026-11-02)

This is a **review-only, fail-closed implementation gate**. It must not activate a sender, observer, payment, checkout, or coverage. The source workflow remains unchanged.

## Current proven boundaries

- `read_draft_candidate_inputs` collects a bounded, statement-consistent bundle; it does not certify post-read freshness or complete scope.
- `prepareTechsafeDraftCandidate` conservatively includes original portal-visible approved equipment, verified additions and removals, and current stored product unit selling prices. It deliberately keeps `scopeVerified`, `snapshotReady`, and `quoteReady` false.
- Portal customer approval receipts can supply a candidate basis, but manual/staff approvals and ambiguous original hidden items remain unsupported.
- Existing observation pairs and application effect tests do not prove all production history, all source mutation paths, or concurrent freshness.
- Early sales-order drafts are allowed; substantial completion is not a prerequisite.
- Full native-schema replay is blocked by legacy migration history; use reviewed schema-only isolation, not production migration repair.

## Required engineering changes before a live draft

1. **Provenance and original membership:** establish trusted, immutable or independently validated original approval receipt, original sold-equipment membership, and explicit handling for hidden, customer-supplied, manual and legacy paths. Unsupported cases must return a hold reason, never infer from current rows or totals.
2. **Complete history:** bind every approved successful equipment application to transaction-proven before/after facts, verify intended effects, ordering, absence of gaps and retries, and current source identity. Never replay an MJV change order.
3. **Eligibility and prices:** verify tenant/customer/order/product identities, current product exclusions, miscellaneous/non-product exclusion, inclusive per-unit minimum, and stored unit selling price (not discounts, miscellaneous %, cost or catalog retail).
4. **Single authorization boundary:** only a trusted backend can convert a complete, current, consistent source bundle into an exportable revision. Keep browser/API roles unable to read private evidence or set readiness flags.
5. **Monotonic revisions and holds:** persist per-order generation/revision and invalidate/hold drafts on edits, connection pause/revoke/rebind, missing evidence or zero eligible equipment. Snapshot hashes alone are not monotonic revisions.
6. **Freshness:** prove source revision at delivery and again before any checkout/activation. If the source is unreachable or stale, fail closed; active purchased coverage stays immutable.

## Test matrix and release gates

- Portal approval with zero and eight successful approved changes; quantity, price, add, remove, retry, deduplication, rollback and out-of-order application.
- Manual approval, legacy missing receipts, hidden originals, missing/changed snapshots, missing observation, mixed tenant, ambiguous bundle and incomplete history: held.
- Project discount, misc percentage, dealer cost and catalog retail changes: no effect on eligible unit value. Product unit selling price and exclusion changes: revise/hold appropriately.
- Pending deposit, pending PO, planning, active, complete, closed: eligible for draft preparation when all evidence passes. Unknown/cancelled/deleted: held.
- Two simultaneous edits, source edit during read/delivery, stale worker, connection pause/resume, credential rotation, replay and receiver outage: no stale sellable draft.
- Native Supabase Auth/RLS/role checks, full-schema triggers/financial/tax parity, concurrent sessions, locks, cancellation, representative load and rollback.

## Implementation order

A. Produce a read-only provenance/coverage inventory for all approval and equipment mutation paths; explicitly list unsupported paths.
B. Add isolated failing regressions for uncovered paths and concurrency races before implementation.
C. Implement minimal private evidence/verification fixes without replacing public approval/apply/reject flows.
D. Validate on a reviewed schema-only isolated environment with synthetic records; observer defaults OFF.
E. Only after passing A–D, implement authenticated sender/receiver and revision/hold protocol in separate PRs.

## Stop conditions

Do not set `scopeVerified`, `snapshotReady` or `quoteReady` true based only on candidate preparation, matched hashes, approved headers or locally synthetic authorization fields. Do not enable live syncing, checkout or payment from this document. No production data migration, backfill or automatic legacy history repair is authorized.
