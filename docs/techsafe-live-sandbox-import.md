# First live sandbox import

The dedicated sandbox order successfully passed the native approval verifier,
persisted export certificate, immediate delivery authority check, Vault receiver
credential and Techsafe import transaction. A second send acknowledged the same
revision/event without creating another receipt or native proposal.

- Source Sales Order: `d8810f86-babd-42d9-8725-1f2a0aeba47f`.
- Sandbox connection: `6ce0d361-fe2d-4b4d-ab37-563329ceb3d4`.
- Techsafe native draft: `2eaa1241-fc20-4651-ae39-58e1b7232793`.
- Revision 1; one receipt and one native binding after retry.
- Equipment: $500. Sold labor: $125, separately preserved.
- Native status `draft`; wholesale and retail prices remain NULL.

The smoke test found that postgres.js 3.4.7 serializes already-stringified JSON
again when PostgreSQL describes a JSON/JSONB parameter. The fixed deployment
configuration preserves serialized JSON text for both OIDs 114 and 3802 and
retains normal JSON result parsing. Existing approval, certificate constraints,
transaction isolation and delivery authorization are unchanged.

The regression uses the actual pinned driver's resolved serializers and a
database JSON-object constraint. CI also exercises the actual PostgreSQL 16
wire protocol with prepare:false, matching deployment. The old configuration
produces a JSON string and fails; the fixed configuration round-trips the exact
document. Malformed JSON still fails in the database.

The sandbox runner was verified with the fix. After merge, deploy the same
configuration to the normal sender and queued dispatcher as well. Temporary
diagnostic responses have been removed. Automatic delivery remains disabled;
the production connection remains held. No plan or payment was created.

Techsafe also needed its existing merged incomplete-draft and sold-labor schema
migrations applied. Its platform-managed project SQL URL works; the old custom
receiver database URL returned a password authentication failure. The paired
receiver fix prefers the platform-managed URL without returning credentials.

This smoke test establishes initial import and identical retry only. The live
receiver still lacks `public.proposal_payment_orders`; native refresh/pricing/
checkout require a separate reviewed financial-schema rollout. Do not infer
checkout readiness from the successful import or enable automatic delivery yet.
