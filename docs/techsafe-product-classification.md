# Techsafe source product classification

This additive prerequisite stores classifications in a separate private techsafe_source schema. It does not add/update catalog product fields, export customer data, enroll equipment or modify any existing Techsafe plan. Keeping metadata separate is deliberate: the live catalog has price, description and tracking triggers that execute on ordinary product UPDATEs.

## Classification and placeholder identity

product_classifications stores product_id, organization_id, product_kind, a sticky miscellaneous_placeholder marker and last classification actor/time. No registry row means unclassified/excluded. Allowed kinds match the Techsafe contract: equipment, miscellaneous, labor, fee, tax, consumable, subscription and unclassified. Only equipment can eventually pass the transport filter; it must still meet dealer thresholds and Techsafe eligibility. Real equipment is not inferred from price, manufacturer, category or merely having a product ID.

The migration seeds known legacy MISC-ITEM SKUs (case/whitespace insensitive) and exact Miscellaneous Item/Misc Item names across organizations. The read-only live preflight found one matching product. It INSERTs integration records without touching those products. Category Misc alone is insufficient because it may contain actual equipment; unknown historical placeholders remain unclassified and excluded pending review.

A new after-insert/name/SKU/organization-update trigger preserves recognized placeholder identity, including OLD names/SKUs during renames. It returns NEW unchanged and never writes back to products. Its privileged registry writes repeat the active editor/organization authorization checks already present in the deployed catalog guard. Cross-organization product ownership changes are rejected, consistent with that existing guard.

Once a product is miscellaneous, the normal classification API cannot reverse it. Editing the line description, increasing the price, renaming the SKU or deleting/recreating an unused catalog row with the same UUID cannot reset the exclusion. Registry records intentionally have no product-delete foreign key so the source identity remains reserved without preventing otherwise valid catalog deletion. Reuse of that UUID by another organization is rejected. Incorrect permanent classifications require a separately reviewed maintenance correction.

## Authorized classification API

classify_techsafe_product(p_product_id,p_kind) is a public SECURITY INVOKER wrapper over a narrowly checked private function. Only an authenticated active user in the product organization with admin role or can_edit_products may classify it. No supplied actor/role claims are trusted. Calls lock product then classification in the same order as catalog edits. The RPC changes only the integration record and returns it; it does not fire catalog UPDATE triggers.

No browser role has direct classification-table privileges. RLS is enabled, functions use fixed empty search_path, anonymous RPC execution is revoked, and the trigger is not directly executable by browser roles. Do not expose techsafe_source as an API schema. The later source exporter must join this registry by product AND organization and treat missing rows as unclassified. It must not trust a browser-provided product_kind.

A catalog review UI and scoped metadata-read endpoint remain to be built. This PR does not bulk classify equipment, add integration settings, or enable draft synchronization. Explicit removal/scope semantics and atomic approved equipment revisions remain separate prerequisites.

## Verification and rollout

Run node tests/techsafe/product-classification.mjs with the repository's existing pinned PGlite dev dependency. The test applies the actual migration to isolated fixtures with a deliberately side-effecting catalog UPDATE trigger, proving both migration seeding and explicit classification leave catalog rows untouched. It also verifies legacy/new/renamed/recreated miscellaneous products, conservative defaults, active-editor authorization, inactive/missing identity, tenant boundaries, invalid kinds, direct registry/function grants and RLS.

The isolated test is not full Supabase API certification or a multi-session concurrency test. Validate against the full deployed schema in a test environment and run security advisors before production migration. The new trigger duplicates existing product-edit authorization rather than granting catalog access. Review the placeholder match count before migration. Disable the integration through its feature/connection flags rather than dropping classifications or reopening permissions.

This work prepares a repository PR only; no migration has been applied to production.
