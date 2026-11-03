# Techsafe: transaction-attached evidence implementation gate

## Decision
Do **not** attach the existing observer to the live change-order applier yet. The private begin/finish helpers are available, but the currently verified tests use a synthetic harness and a minimal schema. No public approval/apply/reject function should be replaced merely to record Techsafe evidence.

## Required source attachment contract

1. Identify the **actual** production function and all callers that mutate approved proposal equipment: approval, apply, retry, reject/unlock, direct proposal edits, sales-order conversion, restore/transfer, and any admin or service-role write. Record function signature, invoker/definer role, transaction scope, lock order, and current error behavior. Unsupported mutation paths must hold quote eligibility.
2. Attach a trusted recorder **inside the original successful application transaction**, not in an asynchronous after-the-fact listener. Obtain the pre-application state, execute the **unchanged original** applier, and capture the post-application state before commit. An original failure must still propagate and roll back. A recorder failure must not turn an unsuccessful source write into success or produce a verified receipt.
3. Preserve all original outputs, authorization, tax, pricing, invoicing, status transitions, triggers, idempotency, and lock order. Never replace the original applier with the withdrawn replacement finalizer or unused managed engine.
4. Bind evidence to organization, connection generation, order, proposal, change-order ID, source input hash, original approval, transaction identity, and before/after equipment facts. Record a successful application once; duplicate/retry ambiguity must hold rather than infer success.
5. Explicitly handle a connection that is disabled, paused, revoked, or rotated mid-transaction. No evidence from a previous generation can authorize a new one. Preserve existing purchased coverage.
6. Only after proving the **full mutation-path inventory** and source continuity should a separate trusted authorization component issue a monotonic order revision. The candidate, original-history anchor and reread diagnostic remain non-authoritative.

## Required full-schema test matrix

| Scenario | Expected result |
| --- | --- |
| Approved CO applies successfully | Original equipment mutation and business result unchanged; one transaction-bound receipt |
| Original applier raises | Same error and rollback as baseline; no completed receipt |
| Recorder begin/finish ordinary error | MJV result unchanged, missing/incomplete evidence, Techsafe held |
| Cancellation, statement timeout, serialization conflict | No falsely completed receipt; source semantics unchanged |
| Two concurrent COs on same order | No fabricated ordering or stale sellable revision |
| Retry, duplicate ADD, contradictory REMOVE, older quantity overwrite | Existing behavior not silently changed; ambiguity held |
| Rejection, unlock, restore, transfer, direct edit | Every path accounted for or integration held |
| Portal and manual approvals; legacy orders | Only independently supported provenance can advance |
| Disabled/revoked/rotated connection | No authorization across generations |
| Mixed organization and browser role | No access to private evidence or forged success |
| Baseline versus instrumented execution | Exact financial/tax/invoice/status parity and comparable latency |
| Receiver offline or source changed after read | No checkout or coverage activation from stale content |

## Execution sequence

A. Inspect current production definitions **read-only** and compare against repository migrations; establish exact function signatures and call graph. Do not use a historical migration replay as proof because legacy replay currently fails before the Techsafe migrations.

B. Build an isolated **schema-only** database from a reviewed snapshot with synthetic records, then execute baseline and instrumented functions with native Supabase Auth/RLS roles and concurrent sessions. Record SQL plans, lock behavior, cancellation and runtime overhead.

C. Propose the smallest instrumented wrapper/attachment PR, with feature flag default OFF and exact definition/permission drift guards. No source replacement and no automatic production enablement.

D. Once A–C pass, implement generation-bound revision/hold persistence and authenticated sender/receiver in separate PRs. Checkout requires a new trusted source freshness verification at the final authorization boundary.

## Release blocker

**No live quote synchronization, payment or checkout activation** until transaction attachment, original approval provenance, complete mutation-path coverage, monotonic revision/hold protocol, and final freshness verification have passed full-schema testing. Synthetic receipts and matching hashes are not sufficient.
