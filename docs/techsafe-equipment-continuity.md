# Internal equipment-history continuity

Techsafe receives one current equipment list for each MJV sales order. It does not receive change-order records, separate change-order quotes, application receipts or this diagnostic history. MJV change inputs are checked internally so the eventual list represents the actual approved sales scope, including applied additions and removals at selling prices.

`assessEquipmentContinuity` is an inactive pure diagnostic that combines the existing current-application assessment and per-application equipment effect checker. It requires a trusted current private read and SQL-validated before/after pairs. Merged PR #400 supplies the private pair capture/reader; this module installs no caller. Continuity tests use synthetic bound fixtures, not a claim that production evidence exists.

## Checks

- The current application evidence must pass first. Every observation must then have exactly one bound pair, with matching identity, transaction, input/scope hashes and decimal-string execution ordinals.
- Every captured application must still belong to an approved change on this order/proposal and match its current inputs. Unapplied drafts can coexist; previously applied changes that were rejected or unlocked remain unverified.
- Every pair must pass the existing equipment effect check. Completed observations alone cannot establish that an addition, removal, quantity or selling-price change occurred as intended.
- Applications are ordered by exact bigint ordinals. Interleaved/overlapping application ranges, incomplete/legacy evidence and repeated applications of a change are refused. In particular, an old quantity retry may match its own action while overwriting a later value; this checker refuses that repeated history.
- Consecutive pairs must have equal scope hashes and equal validated equipment projections at the boundary. The last pair must match the current equipment rows as well as the current equipment hash. Matching claimed hashes cannot hide different supplied rows.

The row comparison reuses the same explicit projection and exact cents/quantity rules as the effect checker. Row order and equivalent numeric formatting do not matter. Identity, product, classification, description, customer-supplied/hidden flags, quantity and selling-price changes do. Cost, catalog retail and labor pricing are outside this equipment projection. Existing classifications and future eligibility exclusions remain separate; hidden state alone still does not establish removed membership.

## Bounds and outcome

At most 1,000 pairs and 10,000 rows per scope/action array are accepted. Current rows plus all supplied before/after/action rows must fit a 100,000-row processing budget. The future loader must enforce byte/storage budgets before loading a history; this pure helper does not fetch or deserialize database responses. Any issue keeps the result false, with no partially accepted history or equipment output.

`historyContinuous` means only that the supplied observed span passed these conservative internal checks. It does not establish its original approved scope, authentic approval provenance, exclusive source access, native transaction commit order, verified product unit selling prices, current authorization/connection health or checkout freshness. SQL validation of pair facts must occur before this helper; it does not reproduce PostgreSQL JSONB hashing in JavaScript or authenticate arbitrary client JSON.

`originalScopeVerified`, `scopeVerified`, `snapshotReady` and `quoteReady` always remain false, including on a successful observed-span check. A valid initial scope basis, complete source coverage, native concurrency/cancellation/performance review and final pricing/freshness verification remain prerequisites for quote synchronization. Repeated or incomplete histories are held for verification; nothing here repairs, replays or blocks an MJV operation.

No database migration, source workflow, UI, external contract, network transport or deployment changes are included. The extraction of the shared equipment-row comparator preserves the existing effect-check behavior.

## Validation

Run `node tests/techsafe/equipment-continuity.mjs`. It covers eight approved changes (quantity, selling price, addition, removal, labor and modifiers), unordered reads, numeric formatting, cost independence, unapplied drafts, gaps with/without inconsistent claimed hashes, final-row drift, overlapping ranges, old retries, approval reversals, legacy/incomplete/missing/foreign evidence, tenant/proposal/transaction/input mismatches, processing bounds and ordinals above JavaScript's safe integer limit. All quote/scope flags remain false.

The existing `equipment-effects.mjs`, ten local `equipment-effects-source.mjs` source scenarios and `application-evidence.mjs` suites are also run. The combined `private-order-source.mjs --equipment-evidence --equipment-pairs` tests from #400 verify that stored facts and the pair reader still work with the extracted shared comparator. No new production or native Supabase behavior is certified by this change.

Product-price policy: use the stored product unit selling price. Project discounts and miscellaneous percentages are ignored and do not block price verification; see `techsafe-unit-selling-price-audit.md`.

