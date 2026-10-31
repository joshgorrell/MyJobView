# Private consistent order facts

`techsafe_source.read_order_source(connection, order)` reads one STABLE SQL statement
snapshot containing the bound order, proposal, contact display name, current
proposal equipment rows, minimal catalog classification, product exclusions,
discount facts, change-order/line facts and current-connection application evidence.
It is a private SECURITY INVOKER function with an empty search path. PUBLIC, anon,
authenticated and service_role receive no execution permission. There is no public
wrapper, API route, worker, caller, schedule or live export in this change.

The function requires the exact connection ID, enabled/active source connection
and verification timestamp within the prior five minutes and not in the future.
Order, proposal, customer, settings and source rows must agree on organization.
Matched catalog/exclusion rows and observations with contradictory bindings make
the entire result unavailable. An authenticated actor, if present in the SQL
session, must be an active profile in the bound organization. The maintenance
fallback is not available to API-role sessions. These checks do not authorize a
future public wrapper; a separately authenticated/scoped server path is still
required. An invoker with insufficient underlying privileges is never elevated.

The migration adds `minimum_unit_value_cents` only to the private integration
connection record, defaulting to zero with a nonnegative safe-integer bound.
There is no browser setter or dealer-settings UI yet, and no connection is seeded
or enabled. A private connection/order/ID observation index supports the bounded
evidence lookup. No existing business table, source trigger, pricing function,
cost handling, approval route or dealer workflow is modified.

## What is returned

The JSON read model uses the same source field names expected by the named-order
and sales-price helpers. It contains the contact's authoritative `full_name`, stable
IDs and current line unit selling price as decimal text. Catalog cost, retail/list
pricing, margin, email, phone, internal notes and arbitrary row dumps are never
selected. Extra unrelated source fields therefore cannot accidentally leak through
a row serialization. Cost/retail/private-contact changes do not change the read
fingerprint. Product opt-outs, names, quantities, selling prices, settings and
relevant source/evidence changes do.

`sourceFingerprint` is SHA-256 of the selected private read-model JSON. It is a
diagnostic state fingerprint, not the receiver's canonical business hash, an
authorization proof, a source revision or a freshness certificate. Connection
keepalive timestamps are excluded from it. The receiver must continue computing
its own canonical hash over a fully validated snapshot.

Current proposal/header discounts and approved/pending change facts are provided
for a future actual-sale-price resolver. The recorded unit price is not declared
to be a resolved net equipment price. Every candidate deliberately has
`salesPriceResolved=false` and unverified membership. An approved header, hidden
flag or even a completed observation does not change those flags. Top-level
`snapshotReady` and `quoteReady` are always false. The existing named-content helper
withholds nonempty unresolved candidate sets. There is no claim that observing
source state alone proves intended equipment history.

Cancelled/deleted source orders, changed connection generations and historical
customer/site mappings need separate verified reconciliation/tombstone handling.
This current-order reader does not invent missing customer data, generation or
revision state. Only current-connection observations are included; a future
reconnection verifier must explicitly reconcile retained older connection history.

## Bounds and failure behavior

Unavailable bindings or inconsistent/over-limit facts return SQL null, not a
partial export. Limits are 1,000 change orders, 10,000 change lines, 10,000 proposal
rows and 1,000 observations; a one-extra-row sentinel detects truncation. Individual
text and a 4 MiB aggregate JSON-body budget additionally constrain payload size.
These are output/materialization safeguards, not a native runtime/latency or
complete memory guarantee. Existing source parent indexes and the private evidence
index help the lookup, but real planner/load/cancellation validation remains pending.
Errors are not converted into a successful empty order. A future worker must
retain an unavailable diagnostic and withhold quote certification.

## Verification

Run `node tests/techsafe/private-order-source.mjs`. The synthetic suite tests named
and priced facts, exclusion/evidence changes, selective fingerprints, wrong
connection/order/tenant, inactive actors, paused/revoked/disabled/stale/future health,
contradictory product/exclusion bindings, oversized text/aggregate data, the exact
change-order row boundary, API-role denial, read-only behavior and declared function
security/volatility. It verifies that completed evidence does not manufacture scope
or quote readiness and that the source-content helper withholds unresolved content.
Minimum settings reject negative and unsafe integer values.

An optional private capture directory compiles the actual migration against the
reconstructed complete source schema and verifies that absent bindings remain null
without seeding connections. Both suites passed. The full-schema reconstruction
runs in PGlite/PostgreSQL 17.5 from the previously verified source capture; it is
not native Supabase, authentication/session, multi-session, performance or deployment
certification. Raw source definitions remain outside the repository. Local security
catalog attributes and role-denial checks are tested; native provider advisors and
rollout checks still require the eventual isolated Supabase environment.

Only a migration file and local tests were created. Neither production database,
website, migration history, source data, observer control, customer/plan record,
coverage nor integration activation was changed.
