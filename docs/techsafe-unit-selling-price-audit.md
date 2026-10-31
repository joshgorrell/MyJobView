# Product selling price is the Techsafe value

Techsafe uses the product's stored unit selling price from MJV. Project discounts, miscellaneous percentages, PM/design/custom fees, taxes, billing flags and aggregate totals do not change that unit value and do not make it unresolved.

For example, equipment sold at $800 remains $800 of unit equipment value when the project has a 10% discount or a 3% miscellaneous percentage. If the product's actual unit selling price is changed to $720, Techsafe uses $720. Dealer cost and catalog retail price are never fallbacks.

## Private source projection

`read_order_selling_price_facts(connection, order)` uses the substantial-completion candidate reader, retaining its tenant, actor, connection-health, project and size gates. It adds only the line's parent, display and child-presence facts for the standalone-price check, plus a bound private price context. It does not query project adjustment fields for pricing.

The candidate removes aggregate `pricingFacts` and projects change headers to identity/status fields needed for internal scope verification. Discounts, percentage values and billing flags are omitted from this price candidate. Those fields remain unchanged in MJV. Lower-level private evidence tools remain internal; no change-order history or pricing diagnostics are transported to Techsafe.

The new reader is STABLE, invoker-only, empty-search-path and has no PUBLIC/anon/authenticated/service_role execute grants. Its final 4 MiB limit remains enforced. It changes no source table, index, trigger, workflow, financial value or existing source function. There is no production caller or deployment in this step.

## Per-line price evidence

`resolveStandaloneSellingPrice({row, context}, binding)` requires matching connection/organization/order/proposal and line bindings, explicit standalone parent/display facts, and a valid nonnegative cent-valued unit selling price. It returns the canonical unit price and cents in a detached result.

It never reads, adjusts for, or blocks on project discounts, miscellaneous percentages, other fees, cost, retail price, financial billing flags, quantity-extended totals or project totals. Quantity and the inclusive per-unit equipment minimum remain separate selection rules. Ten $100 units do not satisfy a $500 per-unit minimum merely because their extended amount is $1,000.

The initial helper still holds parent/child bundles when product-specific allocation is unverified. That is a product-identity/price-allocation question, not a project-discount adjustment. It does not guess missing product prices from a bundle total or cost.

The private reader retains unresolved source-row flags; the helper does not mutate rows or automatically attach price proof to snapshots. Product classification, miscellaneous/non-product/labor exclusion, opt-outs, approved membership, original approval evidence and freshness remain separate gates. A price result alone grants no coverage authority. `scopeVerified`, `snapshotReady` and `quoteReady` stay false.

## Validation

`node tests/techsafe/unit-selling-price.mjs` proves that the stored unit selling price is used directly. Discount, miscellaneous, fee, billing, cost, retail and extended-total getters throw if read; the supported price check still passes. Tests also cover exact cents, source bindings, missing prices, parent/child/display ambiguity, per-unit values independent of quantity, and unchanged input objects.

`node tests/techsafe/private-order-source.mjs --equipment-evidence --equipment-pairs --portal-basis --draft-eligibility --unit-selling-prices` exercises the new private reader in disposable PostgreSQL alongside the previous safeguards. Changing project discounts, miscellaneous percentages and financial billing flags leaves the new price-candidate content and resolved unit price unchanged. Changing a product's unit selling price changes its resolved value. Cost changes do not. Readiness, parent/child and API-role guards are also checked.

The optional captured-schema run compiles the reader against reconstructed MJV source tables without seeding a connection. Existing completed-order preparation against current Techsafe v2 accepts eligible content and preserves active coverage; approved-row connection/history tests pass too. These are local tests, not native concurrency or production-history certification.

Techsafe will receive one final eligible equipment list. Live synchronization remains disabled until the remaining membership, source/provenance and checkout freshness gates are completed.

