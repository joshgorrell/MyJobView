# Dormant application observation primitives

## Purpose and scope

The source audit in #384 found that approved status and matching rows are not reliable evidence of successful equipment application. A strictly external reader cannot recover a missing success record. This PR adds private, unused building blocks for collecting before/after observations from a future trusted caller. It does not install that caller, change any existing source function, add a source trigger, seed a connection, enable a worker or certify any quote.

This is deliberately different from the withdrawn replacement finalizer: no approval routing, role policy, contract/tax behavior, source idempotency, line identity, rejection or unlock behavior is replaced. The old managed application engine remains unused. Normal MJV operations do not call these new helpers.

## Proposed tradeoff before attachment

Durable application observations would require narrowly scoped instrumentation inside the existing successful application transaction. That is a backend source change, even though the dealer's workflow would stay the same. A future attachment PR must make that explicit, preserve the original business code and return/error behavior, and prove full-schema equivalence and performance. Do not describe that future work as a completely read-only integration or silently reintroduce #380's error-propagating hooks.

The proposed caller sequence is: obtain a best-effort observation ID, run the ORIGINAL applier without suppressing its errors, then finish that observation only after the original applier returns successfully. Begin/finish helpers contain ordinary observation SQL errors within their own exception subtransactions and return null. An original application failure rolls back its equipment changes and any observation in the same transaction. Observer failure produces missing/incomplete evidence; it must never authorize a Techsafe quote. A test-only harness demonstrates the sequence; it is not part of the migration.

The helpers do not swallow query cancellation, assertion failures or transaction/session termination. They do not impose a per-observation runtime deadline. Adding work can introduce latency and resource usage even when ordinary errors are contained. Bounded result sizes are not a query-runtime guarantee. Full-schema query plans, indexing, transaction contention, load and cancellation tests are mandatory before any attachment; no zero-impact claim is made.

## Stored facts and security

application_observations is private, RLS enabled, with no anon/authenticated grants. The three helper functions are SECURITY INVOKER, use an empty search_path and have no browser execute grants. There is no public observation RPC. A future caller must independently enforce normal source authorization; a private observation is not a new permission to apply a CO.

The read-set helper joins the CO, sales order, parent proposal and enabled active integration connection in one STABLE statement snapshot, including the caller's own writes. If there is an authenticated actor, active same-organization membership is required. Browser-role calls without an actor refuse evidence even if a future trusted wrapper accidentally exposes them. Cross-organization CO/source/scope rows refuse the read set.

Supported read sets have at most 1000 COs, 10000 CO source lines and 10000 proposal lines. Combined source-row JSON content is limited to 4 MiB before aggregation. Over-limit results return null; no truncated snapshot is certified. Deterministic SHA-256 digests cover all CO payloads on the order and the observed proposal scope. updated_at and the applier's is_active bookkeeping are excluded from source identity, so successful bookkeeping does not invalidate its own observation. Scope hashes omit task completion bookkeeping; remaining source/scope fields are hashed conservatively. Only hashes, binding IDs, transaction/actor identity and observation times are stored, not raw notes, customer data or product descriptions.

Finish requires the same transaction, actor, CO, connection, organization, sales order, proposal and source hash as begin. A later transaction, changed source payload, disabled/rebound connection or other mismatch leaves the observation incomplete. There are no locks that newly gate existing MJV operations because the helpers are not attached. Future caller concurrency and existing non-locking legacy writes remain unresolved.

## What completion does not prove

Completion means only that a trusted future caller reported a successful return in that transaction. A database owner can always manufacture facts; the helper itself cannot prove that a caller invoked the original function. The authorized attachment must be reviewed as part of the trust boundary. Browser callers cannot directly mint these records.

An observation is NOT a verified order snapshot, approval certificate, source revision, durable equipment identity mapping or freshness guarantee. It does not fix the duplicate-add merge, old retries overwriting newer quantities, conflicting restoration, unlocked history, transfer semantics or incomplete historical evidence documented in #384. It captures actual before/after state; it does not establish that actual state matches all intended approved changes. A no-change result can be a legitimate retry or a source ambiguity and cannot be classified from equal hashes alone.

Before any quote can be marked current, a verifier must reject incomplete/stale evidence and contradictions, cover the complete relevant history, bind current source/config/catalog/customer content, and reconcile all non-application write paths. Preexisting orders need a trustworthy automatic baseline strategy; simply seeding receipts is prohibited. Rejection, unlock, delete, transfer and snapshot restoration must be accounted for. Receiver persistence, credentials/generation handling and checkout freshness are separate requirements. No dealer should have to verify line items manually to compensate for an incomplete implementation.

## Validation

Run node tests/techsafe/application-observations.mjs. The cumulative isolated PostgreSQL fixture verifies:

- Existing public apply/reject definitions and security attributes remain identical, and no Techsafe source triggers are attached.
- Successful before/after capture under a test-only trusted harness.
- Forced begin/finish recording failures do not prevent the original equipment save.
- Original calculation errors still propagate and roll back equipment plus observation.
- Disabled connections produce no observation and do not prevent saving.
- Cross-transaction, changed-payload, rebound-connection and oversized read sets cannot finish or produce usable evidence.
- Cross-tenant actors and browser roles cannot use the private primitives directly.

These tests use a minimal schema, not a full deployed clone. They validate the primitives, not a production attachment or complete verification protocol. Nothing has been deployed to either production database. Before use, complete the evidence strategy, attachment review, full-schema equivalence, security, performance and concurrency checks; until then leave all new helpers uncalled.
