# Vendor API integration — initial code audit

Related: #1184, docs/integrations/vendor-tenant-access.md

## Inspected on main
- `src/components/Admin/Settings.tsx`: Admin tabs include `integrations`, `products`, `catalog`. Products tab renders `ProductsManagement`; integrations renders `IntegrationsSettings`.
- `src/components/Admin/IntegrationsSettings.tsx`: known integration identifiers include payment_processor, quickbooks, google_maps, twilio, openai, resend, ringcentral, techsafe, assist. No vendor API entry in this list.
- `src/components/Products/ProductsManagement.tsx`: queries `products` with `manufacturers`, `product_categories`, `product_subcategories`, and `vendors` (default_vendor_id); supports manufacturer and vendor filters, searches manufacturer_model_number, sku and vendor name, and has a hide-cost UI preference.
- `src/components/Proposals/InlineProductSearch.tsx`: searches products by manufacturer_model_number, sku, name, description; uses product cost and our_price; package search also exists.
- `src/components/Invoices/CreateInvoiceModal.tsx`: selected product populates product_id, sku, model from manufacturer_model_number, description, cost, and selling price from our_price.

## Implications
1. Extend the existing `products`, `vendors`, `manufacturers` model. Do not create a second canonical product catalog.
2. Preserve the distinction between manufacturer model and internal SKU, and introduce distributor-specific supplier SKU only as a separate mapping.
3. Do not overwrite `products.cost` or `products.our_price` from raw vendor feeds. Stage vendor offers separately and require explicit rules/user action to adopt costs or recalculate prices.
4. Keep Electronic Life the only pilot tenant. Do not expose vendor pricing or connections to any other tenant without verified vendor-side authorization.
5. Integrations UI can gain a Vendors section, but it must show disconnected/requestable vendors to future tenants, not active access.
6. Catalog cost hiding is a UI preference, not a security boundary; server-side authorization and tenant isolation are required.

## Not yet verified
- Database migrations and actual RLS policies for products/vendors, organization scope and catalog sharing.
- Existing purchasing/order receipt workflows, product importers and vendor credential vault.
- Product update triggers and whether proposals/invoices snapshot costs and prices consistently.
- ADI/Snap One/Control4 API documentation, scopes, dealer account verification and contractual rights.

## Implementation order
1. Inspect migrations, RLS and purchasing/import paths; write a field-level data-flow map.
2. Add tenant-gated vendor connection/request schema with deny-by-default policies, tests and feature flag. No production access enabled.
3. Add normalized supplier offers/mappings and safe sync staging with provenance and stale timestamps.
4. Implement ADI adapter only after official developer access and verification mechanism are confirmed.
5. Connect UI and purchasing incrementally, with tests for no cross-tenant leaks, no silent price changes, and failed sync preservation.

This document is a partial source-code audit, not a claim of a completed schema or live integration audit.
