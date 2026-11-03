# Connecting approval rows to current equipment

Techsafe continues to receive one final equipment list for each MJV sales order. This inactive internal helper adds no change-order transport, separate quotes or dealer-facing history.

`assessApprovedRowsConnection` accepts the existing private portal approval basis, a current private order read, SQL-validated application pairs and a server-loaded binding. It checks that the supplied approved rows connect to today's equipment rather than treating the first observed rows as an invented original baseline. There is no production caller, database migration, network request, source write or workflow change in this step.

## Two paths

| Path | Required comparison |
| --- | --- |
| Observed applications | The existing continuity/effect assessment must pass for the complete supplied history. The approval rows must match the first application's before rows, by both recorded hash and the validated equipment projection. The existing check already connects the last application to current rows. |
| No observed applications | There must be no observations or supplied pairs, and no approved/completed or uncertain rejected change headers. Draft/pending headers with complete bound input metadata may coexist. The approval rows must match the current rows by hash and projection. |

Missing basis evidence never falls back to current rows, totals or a pair's before rows. A basis describing the current end of a changed order cannot substitute for the original start. Missing, incomplete, repeated, reversed, interleaved or inconsistent application evidence stays unverified through the existing history checks. An approved header without a receipt remains blocked even when equipment values happen to match.

The basis must use the supported private portal format and match the connection, organization, order and proposal. Its approval reference, version, epoch metadata, hash and row array are bounded and validated. Current reads and change headers must retain the same bindings. Scope comparisons reuse the existing exact cents/quantity projection. Cost, catalog retail and labor prices do not affect the comparison.

## Meaning and limits

On success, `approvedRowsConnected` reports a connected row set and `connectionMode` identifies `direct` or `observed_history`. It returns no equipment rows or historical details to be sent to Techsafe. No partial history is returned on failure. All inputs remain unchanged.

This connection does not certify authentic approval provenance, original sold membership, eligibility or verified product unit selling prices. A draft header may have been applied before an unlock; direct row equality cannot prove that history never occurred. Hidden rows matching between the approval and current read do not automatically become included or removed equipment. Input verified/quote flags are ignored. `originalScopeVerified`, `scopeVerified`, `snapshotReady` and `quoteReady` always remain false.

The future server caller must load SQL-validated basis/pairs and current evidence consistently; arbitrary client JSON is not trusted. The helper does not reproduce PostgreSQL JSONB hashes in JavaScript, enforce current connection authorization, resolve read-to-checkout races or establish native transaction commit order. Initial membership policy, manual approval evidence, complete source coverage, product unit-price verification, native concurrency/performance and activation remain separate gates.

The helper accepts at most 1,000 pairs, 1,000 change/observation/input records, 10,000 rows per scope/action array, and 100,000 total basis/current/before/after/action rows. A future loader must enforce byte/storage budgets before reading the history. Any overflow fails closed.

## Validation

`node tests/techsafe/approved-rows-connection.mjs` covers an eight-application history, direct no-change orders, untouched drafts, missing/edited/wrongly bound original bases, an end-state pretending to be an original state, inconsistent claimed hashes, row drift, approved headers without evidence, rejected/legacy histories, malformed metadata, input immutability, quota failures and refusal to promote verified flags. The existing continuity tests share a test-only synthetic fixture; its hashes are not claimed to be PostgreSQL digests.

The combined `node tests/techsafe/private-order-source.mjs --equipment-evidence --equipment-pairs --portal-basis` tests now read the real local SQL basis/current functions together in one statement, compare their unchanged rows successfully, and detect a later quantity edit. The source mutations used for this test occur only in its disposable local database transaction and are rolled back. All scope/quote flags remain false, including for matching hidden rows. Existing effect, continuity and application-evidence suites also pass. No native Auth, production history or deployed synchronization behavior is certified here.

Product-price policy: use the stored product unit selling price. Project discounts and miscellaneous percentages are ignored and do not block price verification; see `techsafe-unit-selling-price-audit.md`.

