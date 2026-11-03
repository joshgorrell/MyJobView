# Equipment action effect checks

The inactive `assessEquipmentEffects` helper compares one approved change order's equipment actions with trusted before-and-after source rows. It validates observed effects without executing, repairing, replaying or changing MJV actions. No database migration, source function, UI, worker or network call is added.

## Input boundary

This helper requires independently obtained, complete, transaction-bound before/after snapshots and the exact approved inputs used for that application. Those facts must be tenant/order/proposal/change-bound. They cannot be reconstructed from current rows or supplied by a browser.

The current private observer stores hashes, not these paired row snapshots. This PR does not wire the helper into the reader or claim those inputs are available in production. Persisting bounded private facts with a validated application binding, then validating continuity across the full order history and an original scope baseline, remain separate prerequisites. Passing client booleans, stable rows or matching hashes alone cannot establish that provenance.

## What is checked

The equipment projection includes line identity, product identity, classification, description, customer-supplied flag, hidden flag, quantity and unit selling price. It deliberately excludes cost, catalog retail price, labor pricing, fees and taxes. Numeric selling prices are compared as exact cents; fractional equipment quantities or values outside the existing preparation limits fail closed.

Actions follow MJV's `sort_order NULLS LAST, created_at NULLS LAST` ordering. Equal ordering keys are refused because the source provides no deterministic tie-breaker. Epoch timestamps preserve microseconds. The checker never substitutes an ID ordering.

| Action | Required observed equipment effect |
| --- | --- |
| Modify quantity / price | Existing bound target has the requested quantity / unit selling price; other equipment fields stay unchanged |
| Remove | Explicit approved removal targets an existing line and the resulting row is hidden |
| Add | Exactly one distinct newly observed row matches the requested equipment fields; no existing row matches the source's value-based deduplication predicate |
| Modify labor | Bound target exists; equipment projection stays unchanged |
| Modify modifiers | Equipment projection stays unchanged; resolving net selling prices remains separate |

Unexpected rows, missing rows and collateral equipment changes block the result. Additions already matching existing rows, repeated identical additions, multiple matching new rows and missing targets also block it. Reapplying an already-present addition is intentionally unverified; the checker cannot invent an addition receipt.

The `removedLineIds` output reports targets of matching removal actions in this one operation. It does not classify unrelated hidden rows as removed. `addedLineBindings` likewise describes only unique observed effects in the supplied pair. Both outputs are empty when any check fails. All returned identifiers are allowlisted; source details and cost data are not returned.

## Meaning and limits

`equipmentEffectsMatch` is a local diagnostic, not approval, original membership, full-history correctness, idempotency, current freshness or financial certification. An old quantity retry can match its own requested effect while overwriting a newer change: detecting that history still requires ordered evidence and baseline continuity. A later restoration or edit must invalidate a previously assessed pair through that separate history/current-state check.

Some valid complex histories remain blocked, including addition rows later modified within the same application when no uniquely matching original addition row is observable. Missing evidence must reduce Techsafe availability, never cause replay or a change to MJV behavior. `scopeVerified`, `snapshotReady` and `quoteReady` always remain false.

## Validation

Run `node tests/techsafe/equipment-effects.mjs` for pure cases including action order, quantity/price changes, removal scopes, addition ambiguity, collateral drift, tenant bindings and cost/retail independence.

Run `node tests/techsafe/equipment-effects-source.mjs` for ten scenarios using the unchanged repository applier and rejector in disposable local PostgreSQL. It covers successful equipment changes, deduplicated retry/additions, missing target and a restored removal. Function definitions are compared before and after. This uses a minimal schema, not the full production schema or native Supabase; no financial, RLS, concurrency or production-history certification is implied. Existing full captured-schema tests remain separate.
