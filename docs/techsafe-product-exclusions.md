# Exclude from Techsafe — product setting

This replaces the proposed second product-classification system. MJV keeps its existing material/parts/labor classifications. The new setting is only a product-specific opt-out: Exclude from Techsafe. An unchecked box does not override normal eligibility, non-equipment exclusions or the dealer's price minimum.

## Visibility and integration health

The checkbox appears in Product details → Details only when the organization's integration is enabled, active and recently verified as working. Missing, disabled, paused, revoked, disconnected, expired, future-dated or unknown verification state hides it. A missing RPC/database migration or failed health read also hides it rather than assuming the integration works.

The private integration_connections record must be populated by the future trusted pairing/health workers, never by browser roles. Fresh verification currently means a timestamp within the prior five minutes. No records are seeded; the integration is off until that real connection flow exists. No test health record or fake connection is created in production.

The component checks on mount and every minute while open. The save RPC rechecks health and holds the connection row through commit, serializing against pause/disconnect. If the integration is no longer available at save time, the control hides. Lost/uncertain write responses retain the previous display with an error and disable another write until the product is reopened and its authoritative state reloaded. Disabling the integration preserves saved exclusions for the next valid connection.

## Exclusion behavior

Ordinary products default to no manual exclusion; dealers do not need to reclassify their catalogs. Authorized active product editors/admins can check or uncheck the box. The setting applies to that catalog product wherever it is later considered for a Techsafe draft, including approved change-order equipment. Existing active coverage is unchanged.

Miscellaneous placeholders are automatically excluded and show checked/disabled while the integration is available. Existing MISC-ITEM SKUs and exact Miscellaneous Item/Misc Item names are recognized without relying on price, tax classification or line description. A recognized miscellaneous identity remains excluded through renaming and deletion/recreation of the same UUID. Ordinary manual opt-outs are reversible; automatic miscellaneous exclusions are not.

product_exclusions stores product/organization IDs, excluded, miscellaneous_placeholder and last actor/time. The separate private table avoids updating catalog records: deployed catalog UPDATE triggers can recalculate prices and change tracking fields. The migration seeds only recognized placeholders (one matched the read-only live preflight), without touching products. The source exporter must combine existing product type, authoritative product identity, this opt-out, equipment eligibility and dealer price minimum. That exporter is not enabled by this PR.

## Authorization and storage

Same-organization active users may read the setting through get_techsafe_product_exclusion. Only same-organization active admins/product editors can save through set_techsafe_product_exclusion. Caller-supplied roles/actors are never trusted. Public wrappers are security invoker; private functions have scoped checks and fixed empty search paths. Private tables have RLS and no browser table grants. Anonymous execution is revoked. Do not expose techsafe_source as an API schema.

A narrow catalog after-trigger records miscellaneous identity without changing NEW; it repeats the deployed active-editor/organization checks. Registry identities survive ordinary catalog deletion without changing the catalog's deletion constraints. Source UUID reuse by a different organization is rejected.

## Validation and release

Database tests apply the actual migration to isolated PGlite fixtures and verify optional opt-out/reset, existing item types unchanged, no catalog price/tracking trigger side effects, automatic miscellaneous handling, editor/read-only/inactive/anonymous/tenant authorization and health gates for disabled/paused/revoked/disconnected/stale/unknown states. Browser tests render the real component with mocked RPCs to verify hidden/off behavior, check/uncheck, read-only, locked miscellaneous, failed saves and periodic disconnect detection.

Run node tests/techsafe/product-exclusions.mjs and node tests/techsafe/product-exclusions-browser.mjs. The browser fixture uses the repository's pinned Playwright with Chromium; optional CHROMIUM_EXECUTABLE_PATH and CHROMIUM_ARGS support local browser runtimes.

PR #379 remains unmerged and its original classification migration is replaced, not layered on top. No classification migration needs to be deployed first. Validate against the full deployed schema and run security advisors in a test environment before production application. No production migration, remote sync, payment or coverage changes have been performed.
