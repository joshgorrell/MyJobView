# Techsafe authoritative equipment certificate — implementation gate

Status: **design and pure validation only**. No production certificate table, trusted database adapter, transport endpoint or enabled synchronization exists in this change.

## Source authority
1. Load `sales_orders` (not a proposal-only record) and verify its customer-approved state. Its `proposal_id` identifies the approved base `proposal_line_items`; no unapproved proposal or pending change-order lines may be exported.
2. Within one trusted database transaction, bind the active integration connection, its generation, organization, Sales Order, proposal, and revision ledger. Validate exhaustive base and change-order row counts and customer approval evidence. Do not trust client-supplied `approved`, `complete`, `transactionConsistent` or fingerprints.
3. Establish one transaction-consistent view of base equipment and all relevant customer-approved change-order revisions. Use a serializable transaction with bounded retries for SQLSTATE 40001, or a rigorously proven lock protocol covering **all** writers and all affected scope rows. Connection/ledger `FOR UPDATE` alone does not prove source consistency under READ COMMITTED.
4. Canonicalize the complete approved equipment list, compute a digest on the server, and persist an immutable certificate bound to connection, generation, organization, order, proposal, revision and digest **in the same transaction** as the authoritative read. Mark candidate/held revisions correctly. Do not promote a held ledger based on a caller's digest.
5. Recheck the connection, ledger, certificate and source freshness in a locked server transaction immediately before enqueuing an authenticated delivery. Use a durable outbox and transaction-safe monotonic revision gate, not a separate check followed by an unprotected network call.
6. Techsafe must authenticate the integration and independently verify dealer/tenant binding, environment, source instance, generation, monotonic revision, canonical content and immutable post-purchase lifecycle before applying a draft. Techsafe must not trust an MJV-side certificate as authentication.

## Explicit fail-closed cases
- Inactive/disabled connection, generation rotation, revoked binding, missing certificate, held ledger, digest conflict, revision rollback, unapproved Sales Order, unapproved change, incomplete scan, cross-tenant line, source reparent, stale certificate, ambiguous revision sequence, concurrent write, receiver timeout, replay after purchase.
- A matching pair of pure JavaScript objects is **not** proof of database provenance. `persistedCertificateGate.mjs` is a non-authorizing comparison contract only.
- The `canonicalEquipmentEvidence.mjs` digest is scoped equipment evidence, not the full Techsafe v2 transport snapshot hash; transport also requires status, pricing/classification/exclusions and customer/site information independently validated.

## Required human review and tests
- Review real production schema/constraints and RLS/SECURITY DEFINER boundaries before drafting migration. Do not infer approval from a proposal status string.
- Run real PostgreSQL concurrent transactions for base-line insert/update/delete/reparent, change-order approval/revision mutations, certificate insertion, transaction rollback, generation rotation, and outbox enqueue race.
- Test retry exhaustion, deadlocks, fingerprint conflicts, cross-tenant access, stale outbox deliveries, idempotent receiver replay, and post-purchase immutability.
- Security review required for migration, auth, permissions and live delivery. **Do not activate synchronization** through this PR.
