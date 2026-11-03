# Private equipment snapshot pairs

This migration supplies the private facts required by the equipment action-effect checker. The already opt-in application observer captures an allowlisted equipment projection before and after the original MJV applier, along with the exact approved change inputs. It changes only integration-owned observation storage and private helpers. It adds no public workflow, source trigger, UI, receiver, worker, connection, control enablement or deployment.

## Stored facts and bounds

Each facts object contains a version, connection/tenant/order/proposal/change binding, approved change header, change-line equipment inputs and the full bounded proposal-line equipment projection. Fields match the existing equipment digest projection, including source line identities, selling prices, quantities, product/classification, description, supplied/hidden flags and change ordering inputs. Scope hashes are diagnostic evidence, not Techsafe receiver snapshot hashes.

| Field | Meaning / limit |
| --- | --- |
| equipment_before_facts | Up to 1 MiB of canonical JSONB text; null for legacy observations |
| equipment_after_facts | Up to 1 MiB; only present with before facts and a completed observation |
| equipment_before_scope_hash | Equipment-only before digest, bound to the stored facts |
| Existing input/after hashes and ordinals | Retained, with their existing transaction, actor and binding checks |

The projection excludes cost, catalog retail pricing, customer contact fields, internal notes, labor prices, tax and financial totals. User-entered equipment descriptions remain part of the equipment evidence. No whole source row is copied. The existing older diagnostic `application_read_set` still computes its original private digest; its broader payload is not persisted in these facts or used to price equipment.

The existing reader's tenant, actor, current active/verified connection, row and byte limits still apply. A facts object over 1 MiB is unavailable in full. Begin returns null or finish leaves an incomplete observation, without truncation or a verified partial set. No legacy observations are backfilled, upgraded into paired proof, or replayed.

Snapshots may consume up to 2 MiB per completed observation. Historical storage budgets/retention and workload latency must be reviewed before enabling collection. Reading a pair does not aggregate the history's facts into the current order model; it selects one observation by primary key behind the current scoped reader.

## Private completion and reading

The migration refuses unknown begin/finish helper bodies or execution attributes before changing the schema. Helpers remain invokers with an empty search path. Completion requires the same actor, transaction and approved inputs as begin, the existing source hash, matching bindings and valid before facts. Facts are rehashed through the existing equipment evidence function. Source application errors still propagate from the original applier; ordinary private capture failures remain contained by the existing observation boundaries.

`read_application_equipment_pair(connection, order, observation)` returns a completed pair only when the current scoped reader permits access and both stored facts objects rehash to the recorded scope/input digests. Facts must also equal their canonical allowlisted projection: extra unhashed fields or missing nullable fields are rejected. It rejects malformed, mismatched, incomplete and legacy evidence. Identifiers/ordinals/transaction IDs stay bound, with bigint metadata encoded as decimal strings. Table privileges and new/helper function execution are explicitly denied to PUBLIC, anon, authenticated and service_role; observation-table RLS remains enabled. No API-accessible endpoint is installed.

The returned shape can be passed to `assessEquipmentEffects` by a trusted server caller. Tests exercise that route, but no production caller or authorizing decision is added.

## What a pair does not establish

A valid historical pair remains readable after subsequent source edits or rejection. It describes that earlier application; it must not be interpreted as current approval, current scope or a current quote. A later consumer must combine complete application evidence, per-action effect checks, current-state comparison, full-history continuity and a verified original scope. Net selling-price resolution and checkout freshness remain additional gates.

Same-transaction capture is not exclusive source access. Native concurrent updates, statement cancellation, isolation behavior and load are not certified by local tests. Sequence ordinals remain helper execution order, not transaction commit order. No source locking, serialization or MJV business-rule change is introduced here. `scopeVerified`, `snapshotReady` and `quoteReady` remain false.

## Validation

`node tests/techsafe/private-order-source.mjs --equipment-evidence --equipment-pairs` covers the prior read/evidence safeguards plus new helper drift refusal, no backfill, end-to-end effect assessment, transaction/actor/input binding, before/after hash revalidation, altered/malformed facts, cost/retail independence, timezone stability, facts size limits, source rows surviving failed captures, connection health, tenant restrictions and denied API-role privileges.

`node tests/techsafe/captured-sales-order-scenarios.mjs ../catalog-capture --equipment-pairs` is the optional privately captured-schema rehearsal. It compares 13 original source scenarios with/without observation, with all 374 locally restorable source triggers enabled. Equipment, financial/header/order totals and error results must match, including the existing ADD constraint error and observer failures. It also requires 9 before captures, 8 completed after captures, and 8 matching per-operation effect assessments. Raw captured schema data is not committed. This remains local PostgreSQL, with documented deferred functions/trigger and native Supabase limitations from the capture rehearsal.
