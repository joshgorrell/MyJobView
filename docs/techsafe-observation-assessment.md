# Read-only application observation assessment

This adds an internal diagnostic comparing a stored #385 observation with a newly read source set. It does not create observations, attach a source hook, change MJV actions, enable delivery or authorize quotes. All helpers remain private and unused by existing workflows.

`techsafe_source.assess_application_observation(change_order_id, observation_id)` reads source and evidence itself. Callers do not supply trusted-looking hashes or completion flags. The function is STABLE, SECURITY INVOKER, empty search_path, with no anon/authenticated execute grant and no public RPC wrapper. Source binding/active-organization checks run before evidence lookup. It uses the existing bounded read set; ordinary read failures return an unavailable result rather than a successful match.

| State | Meaning |
| --- | --- |
| source_unavailable | Current approved source/binding cannot be read, is disabled/paused/revoked, is outside the actor's organization, or exceeds read-set limits |
| missing_observation | No specified evidence row exists |
| binding_mismatch | Evidence belongs to a different CO, connection, organization, order or proposal |
| incomplete_observation | Begin exists but finish did not complete |
| source_changed | Current CO payload/history differs from the recorded source set |
| scope_changed | Current proposal equipment content differs from the recorded after-state |
| matches_current_read_set | The observed source and equipment hashes equal the current read set |
| read_error | Source/evidence SQL raised an ordinary read error |

Every result includes quoteReady=false, including a match. A match is a necessary diagnostic for the observed content, not a certificate that the full order history is correct, all intended changes were applied, or a quote may be purchased. A consumer must not interpret the state string alone as authorization. The function returns no customer data, source payload or evidence hashes.

The assessment compares explicitly selected evidence; it does not assume that timestamps or UUID order identify the latest committed application. It never replays source changes. Reading it writes neither evidence nor source rows and adds no row locks to MJV operations. Repeated equal hashes cannot prove missing historical applications. The read set excludes ordinary updated_at/is_active bookkeeping; those changes alone do not claim equipment changed. A return to identical hashed content can produce a match again, so it is not a monotonic source revision.

Connection generation/credential rotation, pause/resume epochs, product exclusions, current customer/catalog/configuration, enrollment evidence, historical baseline validation, unsupported source actions and the verification-to-payment race require additional checks. In particular, a pause followed by resume with identical bindings is not new evidence; the future connection lifecycle must enforce reconciliation. No freshness claim is made after this statement's snapshot. The diagnostic does not introduce a checkout protocol or solve the remaining evidence blockers.

Before enabling synchronization, the trusted recorder still needs a reviewed attachment that preserves the original source function's behavior and passes full-schema security, performance, cancellation and concurrency validation. Existing MJV workflow behavior remains unchanged by this PR. The replacement finalizer and old managed engine remain unused; no registrations are created.

## Validation

Run node tests/techsafe/observation-assessment.mjs and node tests/techsafe/application-observations.mjs. The suites share an isolated database fixture, including a test-only trusted application harness that is not installed by migrations. The new suite runs eight sequential applications and tests changes to quantity, price, product identity, description and visibility; equipment addition/deletion; CO payload/history changes; missing/incomplete evidence; disable/pause/revoke/rebind/unlock; cross-tenant refusal; ordinary read errors; stable/invoker attributes; browser execute denial; unchanged original public function definitions; absence of integration source triggers; and unchanged evidence after assessment. Every expected diagnostic asserts quoteReady=false.

These are isolated PostgreSQL tests with a minimal schema. Full deployed-schema and multi-session testing remain required. No production database, existing source workflow, Techsafe coverage or worker is changed or enabled by this PR.
