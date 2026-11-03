# Composed Techsafe draft business candidate

The current [draft timing policy](techsafe-precompletion-drafts.md) supersedes the earlier substantial-completion restriction.

`prepareTechsafeDraftCandidate` combines the existing private-read checks into one inactive business-content preparation step. It produces one final eligible equipment list for an MJV order. It does not create a plan, send history to Techsafe, persist a draft, allocate a source revision or authorize checkout.

## Supported flow

1. Check the bound sales-order identity and supported status before inspecting approval/application history. Pending deposit/PO, planning and active orders may produce drafts before work is complete. Completion dates and project milestones do not control draft visibility.
2. Connect the existing portal approval basis to the first application, through the complete supported observed history to today's equipment. With no applications, require the approved/current row connection directly.
3. Establish the supported initial membership: originally visible approval rows are included. Originally hidden rows remain unverified; hidden state alone never proves removal.
4. Fold verified unique additions and explicit removals from the existing per-application effect checks. Removal membership comes from the approved action evidence, not a hidden flag. Quantity/price edits retain membership and use today's matched row values.
5. Resolve stored product unit selling prices, then use the existing equipment/customer/content preparation rules for miscellaneous/non-product/labor and customer-supplied exclusions, product opt-outs, removed equipment, the inclusive per-unit minimum and named customer binding.

Project discounts, miscellaneous percentages, fees, billing flags, cost, retail and aggregate totals never enter this preparation's valuation. Ten $100 units remain below a $500 per-unit minimum. Miscellaneous products remain excluded regardless of price. Excluded/removed rows do not need a usable covered price to stay excluded.

The helper replaces input membership/price flags with its own evidence results and passes an explicit field list to the existing content builder. It does not spread source/financial dumps into a candidate. Input objects are not mutated. A passing result contains only the existing Techsafe v2 business-content allowlist, with no approval/change records, project/completion facts or pricing context.

## Holds and boundary

Missing/manual approval evidence, gaps/retries/reversed approvals, unsupported action effects, ambiguous original hidden covered products, unresolved product/bundle pricing, tenant/customer binding failures and other source issues return no content. Product opt-outs and recognized exclusions can make an otherwise ambiguous line irrelevant to the covered set; they never include it. No partial candidate is returned. Zero eligible equipment returns `no_eligible_equipment`, preventing an empty optional draft.

The visible-original-row rule is an explicit conservative policy for the supplied portal-approved rows, not a backfill from current visibility or arbitrary input booleans. It does not certify native approval provenance, all legacy workflows, manual approvals, invisible-but-sold rows or every bundle configuration.

`equipmentMembershipResolved` describes only the membership needed by a prepared candidate under this supported policy. `scopeVerified`, `snapshotReady` and `quoteReady` remain false. A server caller must load authenticated SQL-validated basis/current/pair inputs consistently and complete native concurrency, source revision, delivery and checkout-freshness validation. Arbitrary client JSON cannot authorize a snapshot.

The future receiver/reconciler must key the actual optional draft by source order and replace its complete current equipment list. Held/empty/unready source results must hold any existing draft against checkout, not silently retain stale sellable content. Active purchased coverage stays immutable. None of that transport/persistence/activation work is installed by this helper.

## Validation

`node tests/techsafe/draft-candidate.mjs` builds a final two-product list after eight approved applications, including a distinct addition, removed original equipment and final quantity/price changes. It covers no-change orders, exact unit values, minimums, opt-outs, miscellaneous items, customer-supplied equipment, unsupported hidden originals, forged input flags, precompletion orders with the same eight approved applications, pending versus unapplied approved changes, unsupported-state short-circuiting, missing evidence, drift, unknown prices, no empty candidate, unchanged inputs and forbidden financial/cost getters. The fixture is synthetic and not a native authorization test.

The combined private source suite now composes actual local SQL price/basis reads in one statement with a synthetic visible original receipt. It returns one $800-unit equipment item at quantity two, excludes the expensive miscellaneous product, ignores 50% project discount / 35% miscellaneous settings and holds an unobserved product-price edit. Test data mutations are rolled back in disposable PostgreSQL. Existing approved-row, continuity and Techsafe v2 preparation/active-coverage tests also pass.

Passing the current Techsafe `mjv-snapshot.mjs` path to the draft-candidate test also checks this composed output directly against the real v2 preparation contract: one two-product draft list is accepted and purchased active coverage is preserved. The test adds synthetic authorization/envelope fields only; this does not generate a real authorized source snapshot.

No database migration, MJV source workflow/UI/table, financial calculation, production caller or deployed synchronization is changed. This is a reviewable composed candidate path while remaining activation gates stay closed.

