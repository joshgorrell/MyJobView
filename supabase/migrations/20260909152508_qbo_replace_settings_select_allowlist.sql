/*
# QBO 1.1: Replace Settings Read Access With Safe Allowlist

## Summary

Removes inherited table-wide SELECT privileges from browser roles on
`quickbooks_settings` and grants authenticated users access only to
non-secret connection and synchronization status fields.

## Client-readable columns

- Connection identity and status: id, realm_id, is_connected, environment,
  company_name
- User preferences: auto_import_customers, auto_import_complete_data,
  auto_sync_enabled
- Safe sync timestamps and counters: created_at, updated_at,
  last_customer_sync_at, last_invoice_sync_at, last_payment_sync_at,
  last_reconciliation_at, last_fetch_count, last_fetch_completed_at,
  last_webhook_at, last_synced_at
- Safe sync state labels: sync_health, invoice_sync_status,
  payment_sync_status, customer_sync_status
- organization_id for tenant scoping

## Protected columns

Access tokens, refresh tokens, OAuth state, token version, and internal error
payloads remain unavailable to browser roles. Trusted server-side functions
using the service role remain unaffected.

## Data Safety

No data is changed or deleted.
*/

REVOKE SELECT ON quickbooks_settings FROM anon, authenticated;

GRANT SELECT (
  id,
  realm_id,
  is_connected,
  environment,
  company_name,
  auto_import_customers,
  auto_import_complete_data,
  auto_sync_enabled,
  created_at,
  updated_at,
  last_customer_sync_at,
  last_invoice_sync_at,
  last_payment_sync_at,
  last_reconciliation_at,
  last_fetch_count,
  last_fetch_completed_at,
  last_webhook_at,
  last_synced_at,
  sync_health,
  invoice_sync_status,
  payment_sync_status,
  customer_sync_status,
  organization_id
) ON quickbooks_settings TO authenticated;
