# Named order content for Techsafe

`techsafe-order-content.mjs` combines the sales-price-only equipment helper with
the order's authoritative customer identity and display name. It produces detached
business content for the pre-release Techsafe v2 contract; it does not create or
send a complete snapshot, draft, customer or plan.

The current MJV SalesOrdersView and SalesOrderDetail render the linked contact's
`full_name`. The helper preserves that exact field as `customerName` and uses the
contact ID as `customerRef`. It checks the order/contact/organization relationship,
not name similarity. Two customers can have the same name; a customer can be
renamed without changing identity. Company-name, email, phone and arbitrary contact
fields are not copied or used as fallback names.

Empty, overlong or control-character names withhold all content. Unicode and
ordinary punctuation/whitespace are preserved without truncation. The receiver
must render names as escaped plain text. A name change is business content and
therefore requires a new source revision; the receiver includes it in hashing.

Order/proposal/organization and optional site bindings are checked. When there is
no separate site identity, the stable order ID is an order-specific site reference,
as permitted by the receiver contract; no address or purchase date is invented.
Known MJV pending/planning/active statuses map to open, complete/closed to completed.
Unknown statuses are withheld. Missing/deleted source orders require a separately
verified tombstone path, not this current-order helper.

All equipment values still come from the resolved actual unit sale price.
Existing classifications, per-unit minimum, miscellaneous exclusions, product
opt-outs and explicit per-line membership checks are unchanged. Any incomplete
price/scope candidate withholds the entire content object. Cost and trip-fee
handling are outside this change; no MJV workflow or calculation is modified.

Valid output contains schemaVersion=2, source organization/order/state, USD,
minimum, customer reference/name, stable site reference and allowed equipment
lines. It intentionally omits credentials, dealer IDs, generations, revisions,
events and committed/complete assertions. Both `snapshotReady` and `quoteReady`
remain false. Boolean input facts are not authorization or proof by themselves.
An authenticated, verified source reader and worker must still supply real source
evidence, locked bindings, revisions and delivery before a complete snapshot can
be sent. No such caller or transport is introduced here.

Run `node tests/techsafe/order-content.mjs` and
`node tests/techsafe/sales-equipment.mjs`. Optional absolute paths to the actual
Techsafe `mjv-snapshot.mjs`/`mjv-contract.mjs` modules run cross-repository checks.
The coordinated receiver change ([Techsafe PR #23](https://github.com/joshgorrell/Techsafe/pull/23)) requires v2 and fingerprints names; pre-release
v1 unnamed payloads are rejected. Both repositories must be updated together
before any sender/receiver is enabled. There are no active imports to migrate.

Tests cover exact MJV names and stable references, wrong organization/customer/site
bindings, blank/Unicode names, known/unknown statuses, detached immutable content,
unresolved sales values, empty equipment, no private contact/cost leakage and
absence of snapshot authorization. Cross-repository checks pass for named draft
preparation, name-change conflicts/new revisions and active-coverage preservation.
No source query, database migration, customer creation, live draft, deployment or
integration activation occurs.
