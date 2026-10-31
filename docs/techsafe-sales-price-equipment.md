# Sales-price equipment preparation

Techsafe equipment value and the dealer minimum use the **actual equipment selling
price per unit**. Product cost, profit, margin, catalog retail/list price, labor,
tax and fees are not alternate price sources. For example, a product sold for
$800 qualifies against a $500 minimum regardless of its dealer cost. Ten $100
units do not qualify against that per-unit minimum merely because the line totals
$1,000. Exactly $500 qualifies.

`supabase/functions/_shared/techsafe-sales-equipment.mjs` is a pure, inactive helper
that prepares candidate lines compatible with Techsafe's existing snapshot
contract. It has no database client, endpoint, caller, source write, transport,
price-setting effect or activation path. It always returns `snapshotReady=false`
and `quoteReady=false`, including for valid candidate sets.

## Input and price meaning

A future trusted consistent source read model must provide the organization,
order and proposal bindings; current proposal-line rows; same-organization catalog
rows; resolved private product-exclusion records (explicit null means no record);
verified per-line membership bound to this order/line; and the resolved actual
unit equipment selling price. These are transient internal inputs, not new source
columns, classifications or dealer settings.

`unitSalePrice` is a USD decimal value supplied separately from catalog data, and
`salesPriceResolved` must be exactly true. There is deliberately no fallback to
product cost, catalog retail/list price or an unverified raw line value. The future
reader may use the current line's recorded selling price where it is final. If
order-level discounts, credits, allocations or mixed equipment/labor pricing make
the final per-unit equipment price uncertain, the reader must leave it unresolved
until the actual equipment sale value is determined. This helper invents no
discount allocation or repricing rule and does not change MJV totals.

Decimal strings convert to integer cents without binary floating multiplication
or rounding. Negative, non-finite, exponent, over-precision, overflow and malformed
prices are rejected. Equipment quantities must be whole, bounded counts matching
the current receiver contract; fractional or unknown quantities block preparation.
The wire field `unitEquipmentValueCents` specifically contains the actual unit
selling price. No plan premium or risk factor is calculated here.

## Existing classifications and exclusions

The helper reuses MJV's existing material/labor/both values. A real material product
on a material/both line is an equipment **candidate**; labor is excluded. Combined
lines use only the resolved equipment sale component, never labor totals. This is
not a new stored classification or coverage-eligibility certification. Techsafe
must still apply its own equipment/category/enrollment rules.

Miscellaneous placeholders are always excluded, even with a real product UUID,
changed line description or $5,000 price. The same MISC-ITEM SKU/exact product-name
rules as the exclusion foundation are recognized, and the private sticky
miscellaneous flag wins after renaming. Ordinary product opt-outs are honored and
reversible. Non-products, removed membership, customer-supplied equipment and
zero-value/quantity rows are excluded. Taxes, labor, fees and modifiers are not
added to equipment value. Trip-fee work is outside this change.

`is_hidden` is presentation only. It cannot establish removal or inclusion.
Unverified membership blocks the candidate set. Product/exclusion/tenant/proposal
bindings and duplicate source IDs are checked; contradictory product eligibility
facts for the same product are rejected. Distinct legitimate source lines remain
distinct, even with identical product, description, quantity and price.

Output lines use an explicit field allowlist. Cost/margin/catalog pricing/source
dumps are not copied or accessed. If any physical candidate has an unresolved
price, scope, product/classification or invalid quantity/value, `equipment` is
empty with diagnostics rather than a usable partial candidate set. A future
caller must still authenticate, verify connection generation, source completeness,
application history and freshness, and construct/authorize the complete envelope.
The boolean input facts here are not authorization credentials or evidence by
themselves.

## Validation and delivery status

Run `node tests/techsafe/sales-equipment.mjs`. Tests cover cost/list-price
independence (including getters that throw if cost is read), exact cent boundaries,
inclusive per-unit filtering, existing classifications/exclusions, hidden versus
verified membership, multiple source identities, tenant binding, unresolved partial
blocking, quantity/overflow rejection and the output field allowlist.

An optional absolute local path to Techsafe's contract module checks the real
receiver contract without duplicating it in MJV. The earlier pre-release v1 check
passed at Techsafe commit `001413f6833420cca69d55129f25254e6264428c`.
The current synthetic envelopes require the named v2 contract in
[Techsafe PR #23](https://github.com/joshgorrell/Techsafe/pull/23), verified at
`6c0aafe44f8eebfcf90fcd575a2cee7260ec763b`. Eight revisions cover current
quantity/sales-price changes, final removals, miscellaneous exclusion and empty
draft suppression. Complete-envelope flags are synthetic test data, not source
certification. CI runs the standalone MJV suite without another repository or
credentials.

Dealer linking, server-loaded settings, the consistent verified source reader,
verified customer context, revision/checkpoint storage, delivery/reconciliation and
checkout freshness remain separate implementation work. This helper is not yet
called by either website. No source cost correction, database migration, production
query, integration activation, automatic draft or coverage change is included.

