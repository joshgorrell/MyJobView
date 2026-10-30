# Live source compatibility preflight

## October 30 read-only result

MyJobView #387 was verified merged. The connected source database was inspected using catalog SELECTs and a planner-only EXPLAIN; no source rows, schema, controls or migration history were changed. PostgreSQL reported version 17.6.

The repeatable catalog check passed:

- The live equipment applier's normalized business body exactly matches the original tested baseline, with SHA-256 4bfa9641b1dc7fe4bddd52148b025597f8d775852eeb656b1cadaab7d2c997bd.
- Its existing SECURITY DEFINER/void/search_path shape and postgres owner match the expected execution model. Anonymous execution is denied and authenticated execution is allowed. Those grants alone do not validate source authorization or tenant checks.
- All 23 directly required column names/types match. Metadata inspection covered 432 columns across the six relevant tables; the committed fixture retains only the required subset and per-table counts.
- Full valid B-tree parent indexes exist on change_orders.sales_order_id, change_order_line_items.change_order_id and proposal_line_items.proposal_id. Partial indexes alone do not satisfy the check.
- No techsafe_source schema, observer control table or observer code is installed in the connected database. Merging the repository PRs has not deployed or activated them there.

The planner-only diagnostic completed with estimated total cost 21.48 (planner cost units, NOT milliseconds). Some scans were sequential, with small estimated table populations (including 4 COs, 7 CO source lines and 51 proposal rows in the relevant plan nodes). The indexes exist; this does not justify forcing index scans or adding another source index. Those estimates are not audited actual counts or a representative workload test. No source query was executed by EXPLAIN because ANALYZE was omitted.

The planning SQL substitutes an inert placeholder connection and a nonexistent synthetic CO identity because private integration tables are not installed yet. It covers the source-read shape from #385, not the full installed authorization/connection path or real post-activation load. Do not use its estimated cost as a latency budget or rollout approval.

## Repeatable checks

scripts/techsafe/observer-preflight.sql is a standalone catalog-only SELECT. It invokes no application save/observation function, uses no application row data and requires no integration schema to be installed. Run it with a trusted read-only maintenance connection before deployment and after schema changes. It reports structural compatibility separately from deployment and quote authorization; fullSchemaScenariosValidated, loadAndConcurrencyValidated, deploymentApproved and quoteReady deliberately remain false.

The function fingerprint check recognizes exactly the known original and #387 observer implementations. It also compares the business body after stripping only the marked observer sections. Checking the stripped body alone would miss an unsafe change hidden inside those sections; the full implementation fingerprint closes that gap. Unknown versions require review and an explicit updated baseline, never automatically accepting the live hash. Even benign function/comment changes may require review. Fingerprints are drift detectors, not proof of all function dependencies or behavior.

scripts/techsafe/observer-plan.sql is a separate EXPLAIN without ANALYZE. It uses placeholder IDs/connection data, does not invoke source mutation functions and returns a plan only. Do not add ANALYZE or substitute real order identities as a casual performance test. Real workload validation belongs in the isolated full-schema environment with synthetic data.

The metadata-only JSON fixture records the captured schema shape, required indexes, trigger inventory, baseline applier body and the result/plan summary. It includes no customer records, tokens, raw order data or credentials. It is a dated capture, not a live guarantee. CI tests the checker against synthetic baseline/observer states and deliberately missing indexes, wrong types, changed ownership/business code and unsafe changes inside observer markers.

## Remaining deployment gates

This preflight does NOT complete the full-schema validation required by #387. The live trigger inventory includes catalog availability, line/labor calculations, totals, task seeding, proposal touches/hashes, tax/finalization, history, Flow and deferred sales-credit work. These were identified by catalog inspection; their complete interactions have not been replayed in a cloned database. The compact fixture is not a full database clone and does not copy data, constraints, policies, defaults or all dependencies.

Before deployment or any pilot activation:

1. Create an isolated full-schema test environment and verify the cumulative migrations, existing callers, privileges, RLS, triggers, tax/modifier/billing behavior and every application action there.
2. Compare baseline and observer source results/errors, including all disabled-path cases, using representative synthetic source sizes and near-limit payloads.
3. Measure enabled and disabled latency, query plans, memory/read volume, simultaneous COs, lock contention, missing-helper/control failures and cancellation behavior. Establish an acceptable budget from measurements rather than planner costs.
4. Keep per-organization controls empty/off; retain evidence and prepare a reviewed marked-section removal migration as the overhead rollback option.
5. Finish historical/intended-scope proof, non-application source reconciliation, current customer/catalog/config inputs, receiver persistence, connection lifecycle and checkout freshness. Neither structural compatibility nor a matching application observation authorizes publishing a current quote.

No migration, index, source function, control or connection was changed in the live database for this check. The two websites and active coverage were not modified.

## Local verification

Run node tests/techsafe/observer-preflight.mjs. It checks the metadata capture, known original/observer variants, missing parent-index detection, wrong column type/owner, business-body drift, observer-only drift, planner-only SQL and permanent separation of structural results from deployment/quote approval. The test executes only in a disposable PostgreSQL fixture. Full-schema, production-like load and multi-session scenarios remain outstanding.
