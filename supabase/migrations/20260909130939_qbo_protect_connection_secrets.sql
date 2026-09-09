/*
# Protect QuickBooks connection secrets from browser clients

## Summary

This migration keeps QuickBooks access and refresh tokens available to trusted
Edge Functions while preventing authenticated browser clients from reading or
changing them through the Supabase Data API.

## Security Changes

1. Revoke table-wide SELECT and UPDATE privileges on `quickbooks_settings` from
   authenticated users.
2. Grant SELECT only for connection status, company identity, sync health, and
   non-secret settings needed by the admin screen.
3. Grant UPDATE only for the two user-controlled sync preference columns used by
   the admin screen.
4. Service-role Edge Functions retain access for OAuth, API calls, refresh, and
   disconnect operations.

No rows or data are deleted, and existing row-level policies remain in place.
*/

REVOKE SELECT ON quickbooks_settings FROM authenticated;
GRANT SELECT (
  id,
  organization_id,
  realm_id,
  is_connected,
  environment,
  company_name,
  auto_import_customers,
  auto_import_complete_data,
  auto_sync_enabled,
  last_customer_sync_at,
  last_fetch_count,
  last_fetch_completed_at,
  last_webhook_at,
  sync_health,
  last_error,
  created_at,
  updated_at
) ON quickbooks_settings TO authenticated;

REVOKE UPDATE ON quickbooks_settings FROM authenticated;
GRANT UPDATE (auto_import_customers, auto_import_complete_data, auto_sync_enabled)
  ON quickbooks_settings TO authenticated;
