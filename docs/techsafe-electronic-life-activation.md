# Electronic Life — MJV ↔ Techsafe controlled activation

## Current state (do not mistake CI for production readiness)

MJV dispatch currently returns `source_transport_authority_not_implemented` and does **not** invoke `deliverDraft`. Admin > Integrations > Techsafe reports `sourceReaderCertified=false` and `liveSyncEnabled=false`. The Techsafe `mjv-import` receiver starts disabled until server-owned credentials and a transaction-capable database are configured. Do not flip flags, create synthetic authority, or mark this integration live to make the UI green.

## Required end-to-end implementation (one vertical slice)

1. **Connection registration:** Create a single tenant-scoped Electronic Life MJV connection and corresponding Techsafe dealer binding through authenticated, audited, server-only provisioning. Use distinct credentials, a single source instance ID, an environment, and a generation. Never expose bearer tokens or token hashes in the browser, logs, or SQL diagnostic RPC.
2. **Approved Sales Order authority:** Inside one server-owned SERIALIZABLE PostgreSQL transaction, read the existing approved Sales Order and applied change-order equipment, labor selling amounts, organization/dealer binding, current connection generation, revision, and immutable source fingerprint. Prove product membership, per-unit selling prices, and completeness against the authoritative MJV data model. Do not treat the current v1 diagnostic SQL read model as certified.
3. **Source certification:** Persist and re-read the independent certificate and source revision under the same transaction locks. Fail closed on missing rows, concurrent edits, stale evidence, unauthorized proposal, invalid or duplicate lines, mismatched customer/site, and revoked/rotated connections. An approved proposal's public name is Sales Order; drafts are never eligible.
4. **Transport:** Build the allowlisted v2 snapshot only from certified server evidence; include all committed Sales Order equipment and approved change-order equipment as namespaced `change:<line-id>` lines, and labor sold. No separate change-order objects, internal cost/margin, or customer-supplied labor. Techsafe applies the dealer's **per-unit** equipment threshold; it must keep the read-only MJV labor amount distinct from editable Techsafe labor coverage.
5. **Receiver and receipt:** Post authenticated root-level v2 JSON to Techsafe's `mjv-import`. Verify connection/order/generation/revision/event identity and receiver action; an HTTP 200 without a verified receipt is not success. Only create/update native drafts; never rewrite purchased plans.
6. **Safe rollout:** Use a synthetic sandbox Sales Order first, then one explicitly approved Electronic Life test Sales Order. Verify customer mapping, included/excluded equipment, approved change orders, labor override persistence, duplicate replay, changed revisions, paused/revoked credentials, and purchased-plan immutability. Keep purchase/checkout disabled until explicitly approved.

## Existing automated contract coverage

`node tests/techsafe/receiver-contract-matrix.mjs` exercises the real MJV transport-snapshot constructor and HTTP sender against simulated documented Techsafe receiver receipts. It checks original equipment, approved change-order lines, below-threshold items (transmitted for receiver eligibility filtering), labor, created/updated/duplicate/older/purchased/suppressed receipts, and negative authority/privacy/receipt cases. The Techsafe dispatch GitHub workflow runs it on PRs.

**This is a local contract test, not a live delivery test.** Do not call Electronic Life connected until both production sides are provisioned, the trusted source reader is certified, and a real receiver acknowledgment is recorded.
