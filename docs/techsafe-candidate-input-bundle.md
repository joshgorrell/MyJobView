# Bounded candidate input bundle

`techsafe_source.read_draft_candidate_inputs(connection, order)` collects the supported sales-order model, original portal approval basis, and complete observation pairs for `prepareTechsafeDraftCandidate`. It is a private, STABLE, SECURITY INVOKER SQL function with an empty search path; PUBLIC, anon, authenticated, and service_role have no execution permission. Existing actor, tenant, active connection, recent verification, and supported-order binding checks still apply. Completion dates are no longer a draft prerequisite; see [draft timing policy](techsafe-precompletion-drafts.md).

All reads use the calling statement's PostgreSQL snapshot. This prevents assembling a model and history from separate calls that could see different committed states. It does not prove that the order remains unchanged after the statement, authorize transport, or establish checkout freshness.

## Whole-input limits

- At most 1,000 observation pairs, with all observations accounted for.
- Each stored before/after fact document remains limited to 1 MiB.
- Stored byte counters plus conservative envelope overhead must fit 8 MiB before historical fact documents are loaded and rehashed. The actual final JSON text must also fit 8 MiB.
- Current, original, before, after, and change-action arrays together must fit 100,000 entries.

Missing original approval evidence, incomplete observations, missing legacy byte metadata, invalid bindings or hashes, oversized history, or unavailable authorization produce SQL NULL. The reader never returns a partial history. Unsupported order states are rejected before original-approval lookup; early supported orders still require the full original/applied evidence. Metadata uses the existing connection/order index; historical facts are fetched by observation primary key. The current order is read once, rather than once per pair.

The bundled pairs have the same validated shape as `read_application_equipment_pair`. Collection alone does not certify their approved effects or continuity; the composed candidate must still validate the original-to-current equipment chain and selling prices. Unsupported manual approvals, ambiguous bundles, and legacy evidence remain held. Project discounts, miscellaneous percentages, billing fields, dealer costs, and catalog retail do not determine equipment values.

## Private capture metadata

The migration adds nullable before/after fact byte counters to the integration-owned observation table. CHECK constraints tie each populated counter to the exact stored fact text size. Existing rows are not updated, replayed, or promoted into proof. Old observations without counters remain unavailable to this reader.

The existing private begin/finish helpers receive only the counter assignments. Exact prior definition and security-attribute guards require review if those helpers have drifted. Their actor, transaction, input and canonical fact checks, API revocations, and failure isolation remain intact. There are no new source business hooks, source triggers, managed registrations, or source workflow repairs. The observer remains default-off.

Metadata capture adds bounded work to the existing opt-in observer. The schema migration also requires ordinary DDL locking and constraint validation on its private table. Native performance, lock/cancellation, concurrency, authenticated transport, receiving persistence, stale-draft holds, and final freshness checks remain deployment/activation gates. Local PGlite results do not certify production performance or Auth behavior.

## Envelope

The JSON contains `bundleVersion: 1`, `currentModel`, `basis`, `pairs`, `inputFingerprint`, and `readAtEpoch`. The fingerprint covers the collected body and excludes the read timestamp. It is a diagnostic input fingerprint, not an authorization signature or receiver content hash. `scopeVerified`, `snapshotReady`, and `quoteReady` remain false.

## Validation

`node tests/techsafe/private-order-source.mjs --candidate-inputs` exercises direct and applied equipment preparation, parity with the existing pair reader, helper drift rejection, counter integrity, no legacy backfill, corrupt facts, precompletion candidates and unsupported states, authorization, API role denial, and an oversized-history fuse that raises if historical rehashing occurs before the byte gate. It also verifies stable repeated fingerprints and unchanged source rows.

`node tests/techsafe/captured-sales-order-scenarios.mjs <reviewed-catalog-directory> --candidate-inputs` compares all 13 source operations with and without the integration migrations against the reconstructed catalog, including observer outages. The original ADD cost-constraint failure is preserved. The capture contains schema definitions; test business records are synthetic. No test connects to a production database.

