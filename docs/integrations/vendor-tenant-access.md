# Vendor integration access architecture (Issue #1184)

Status: design contract only. Initial activation is **Electronic Life only**; no vendor connection is automatically granted to other tenants.

## Tenant experience
- Platform admins publish vendor connector metadata (name, logo, supported capabilities, eligibility instructions).
- A tenant administrator may request access to a listed vendor and submit their dealer account number.
- A submitted account number is **not** proof of entitlement. Access remains pending until verification through a vendor-approved method (OAuth/delegated consent, vendor API validation, or documented manual vendor confirmation).
- A verified account receives only vendor-confirmed entitlements, including brand-specific restrictions (Control4 is not implied by ADI).
- Connections can expire, be suspended or revoked. Reverification is required when vendor policy demands it.
- Electronic Life is the sole initial pilot tenant, subject to its own vendor authorization.

## Proposed logical records (adapt to existing schema after audit)
- vendor_connectors: connector identifier, public directory metadata, capabilities, platform enabled flag.
- tenant_vendor_requests: tenant ID, connector ID, submitted account reference, requester, state, timestamps, verification outcome.
- tenant_vendor_connections: tenant ID, connector ID, vendor-issued account identifier, status, verification method, verified_at, expires_at, scopes.
- tenant_vendor_brand_entitlements: connection ID, brand ID, authorized operations.
- tenant_vendor_secrets: server-only secret reference; never return credentials to browser.
- vendor_supplier_offers: tenant ID, canonical product ID, connector ID, vendor SKU, cost, availability, currency, last_verified_at, provenance.
- vendor_sync_runs: tenant ID, connector ID, cursor, status, error category, timestamps and counts.

## Access rules
1. Enforce tenant scope and verified active connection on the server for price, stock, order submission, refresh and export endpoints.
2. Enforce brand-level scope when applicable.
3. A tenant cannot query another tenant's vendor account, cost, tokens, jobs or cached responses.
4. Public product metadata is shown only when supplier licensing allows it.
5. Never use the presence of a vendor account number as an authorization decision.
6. Redact account identifiers, secrets and pricing from logs, telemetry and shared caches.
7. Explicit vendor revocation disables future API access immediately; historical order/quote snapshots follow the platform's retention/access policies.

## Product mapping and price safety
- Manufacturer model is distinct from supplier SKU; one product may have multiple supplier offers.
- Ambiguous product mappings go to review; no automatic overwrite of canonical products.
- Failed or empty syncs cannot clear last known valid prices or existing product records.
- Every displayed price includes source, verification timestamp and stale state.
- Approved quotes and sales orders retain price snapshots until explicitly repriced by an authorized user.
- Purchasing captures actual supplier and order/invoice dates to support warranty and RMA workflows.

## Verification states
not_connected -> requested -> pending_vendor_verification -> authorized
requested/pending -> rejected
authorized -> suspended / expired / revoked
suspended/expired -> pending_vendor_verification -> authorized (on successful revalidation)

## Required implementation gates
1. Audit existing product, vendor, pricing, purchasing, integration and RLS schema before migration.
2. Implement feature flags with default-deny for all tenants and a pilot allowlist for Electronic Life.
3. Test cross-tenant isolation, unauthorized access, account spoofing, brand scope, revocation, failed sync, and historical price preservation.
4. Verify ADI/Snap One/Control4 API scope, developer terms and vendor account approval before enabling live sync.
5. Ship incremental PRs; no destructive migration and no live activation based solely on this design document.
