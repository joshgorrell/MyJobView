# Paylocity integration: multi-dealer architecture and launch gates

## Product decision
Paylocity is an optional dealer-level integration, not an Electronic Life-specific feature. Electronic Life is the first pilot. MJV records operational daily/job time for dispatch, costing and productivity. Paylocity is the authoritative payroll processor and, when supported by the approved API scope, the PTO system of record. MJV must not calculate or issue paychecks.

## Existing code touchpoints (audit)
- `src/components/Technician/EmployeeTimeClock.tsx`: employee Daily Clock, Job Clock, My Time.
- `src/hooks/useEmployeeTimePolicy.ts`: employee payroll time basis and Daily Clock visibility.
- `src/components/Finance/FinanceTimeWorkspace.tsx`: existing payroll/time review, approvals and reconciliation.
- `src/components/Technician/DailyClock.tsx`: local PTO balances and `submit_time_off` RPC. PR #434 adds another UI entry point; it must not become a second authoritative PTO ledger.
- `supabase/config.toml`: existing server-side integration pattern (QuickBooks Edge Functions).


## Independent accounting and payroll integrations (non-negotiable)
MJV must expose two independent dealer-level provider selections:
- **Accounting provider:** QuickBooks or none. Existing QuickBooks OAuth tokens, company mapping, customers, invoices, payments, reconciliation, webhooks and accounting sync remain unchanged when payroll selection changes.
- **Payroll provider:** Paylocity, QuickBooks Payroll, or none. Only one active authoritative payroll provider per dealer. Paylocity selection must not overwrite QuickBooks accounting settings, tokens or integration status. QuickBooks Payroll is a distinct future adapter and must not be inferred merely because QuickBooks accounting is connected.

Supported combinations include QuickBooks accounting + Paylocity payroll, QuickBooks accounting + QuickBooks Payroll, QuickBooks accounting without payroll integration, and Paylocity payroll without QuickBooks accounting. Different dealers may select different combinations. Switching payroll providers requires explicit admin confirmation, reconciliation of outstanding batches, and no implicit data deletion.

**Integration routing guardrails:** accounting events (customer, proposal/invoice, payment, general ledger) route only to the accounting adapter. Payroll events (approved payable time, employee payroll mapping, payroll reconciliation, PTO where supported) route only to the selected payroll adapter. Never send job-clock entries as an extra payroll line on top of daily payable hours. Never create duplicate payable entries through QuickBooks accounting and Paylocity simultaneously. QuickBooks accounting webhooks and Paylocity payroll callbacks must use distinct endpoints, credentials, queues, and idempotency keys.

**Audit finding:** The existing `supabase/config.toml` registers numerous QuickBooks accounting Edge Functions, and `FinanceTimeWorkspace` has existing payroll review components. No shared provider-routing layer was verified. The typed provider-selection contract added in this PR is preparatory only; database tenant settings, adapters and enforcement still need implementation and integration tests before activation.

## Proposed architecture
1. Dealer Admin > Integrations > Paylocity: disabled by default, with connection health, sandbox/production indicator, capabilities, mappings and last sync. Only dealer administrators may enable or disconnect their own tenant.
2. Server-side provider adapter and secret storage. OAuth2 client-credentials tokens must never reach the browser. Authorize every operation using the authenticated tenant and verify Paylocity company ID against the tenant's configured company IDs. Never trust tenant IDs from client request bodies.
3. Store dealer-specific provider connection, credential reference (not plaintext), Paylocity company ID(s), employee mappings (including separate Time & Labor employee number), pay-period mapping, cost centers/labor levels, record type mapping, and configured timezone.
4. Keep raw MJV daily/job records and corrections for operations. Produce an immutable, approved, payroll-specific snapshot per pay period. Job clock punches are NOT automatically additional payable hours on top of daily clock punches.
5. Export finalized approved payroll punches to Paylocity Time & Labor only when configured and authorized. Respect 500-record maximum, open pay-period requirement, record type/File Map mapping, employee timezone and labor-level rules. Submission is idempotent at MJV: never retry an uncertain submission blindly, since Paylocity does not support editing imported punches.
6. Track pending/submitted/needs_review/reconciled states, source revision, batch fingerprint, sanitized response, and operator audit trail. A HTTP 200 is not proof every punch was imported; Paylocity import error details are available in its Time & Labor UI and may require manual reconciliation.
7. PTO: read balances/requests from Paylocity only if the granted API supports them. Otherwise show a clear Paylocity handoff or documented supported import; do not write competing PTO balances or promise two-way sync. Approved PTO punch import is a distinct feature from PTO balance/approval APIs.
8. Tenant isolation: RLS and server checks, company ID allowlists, least-privilege scopes, encrypted credentials, rotation/revocation, retention policy, no PII in logs, per-tenant rate limiting.
9. Feature flags: per-dealer connection and capability flags, pilot only in sandbox until approved, production enablement after sign-off, safe disconnect without deleting MJV historical operational time.

## Pilot / go-live gates
- Paylocity technology partner discussions and agreement for broad dealer availability; Electronic Life as first customer advocate.
- Sandbox credentials and permitted endpoints/scopes, company IDs, File Map, employee numbers, labor levels, timezones, pay periods.
- Demonstrate 40-hour week, breaks, overtime, PTO/pay adjustments only where supported, employee transfers, DST, salaried/job-time mapping, corrections, duplicate prevention, partial failures and tenant isolation.
- Obtain documented approvals for final submission and payroll reconciliation; verify Paylocity Time & Labor import UI and payroll totals.
- Do not automatically switch payroll on 2027-01-01 unless access, mappings, acceptance tests and cutover sign-off are complete.

## Current implementation boundary
`src/lib/payroll/providerContract.ts` is a typed contract with local batch validation only. It does not store credentials, call Paylocity, enable any tenant, sync PTO, or export payroll. This PR is an architecture foundation, not a live integration.

References:
- https://developer.paylocity.com/integrations/docs/partnership-requirements
- https://developer.paylocity.com/integrations/reference/authentication
- https://developer.paylocity.com/integrations/reference/punch-import-overview
- https://developer.paylocity.com/integrations/docs/punch-data-imports
- https://developer.paylocity.com/integrations/reference/punch-import-field-mapping
