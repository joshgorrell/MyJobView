/*
# QBO 1.1: Restrict Client Access to Connection Secrets

## Summary

This migration closes a critical access-control gap in
`quickbooks_settings`. Browser roles previously retained broad INSERT,
UPDATE, and DELETE privileges on the table, which could allow a client to
write access tokens, refresh tokens, realm IDs, connection health, or other
server-owned values even when row policies were present.

## Modified Table: quickbooks_settings

Client roles may now:
- Read only non-secret connection status fields through existing
  organization-scoped SELECT policies.
- Update only the three user-controlled sync preference columns:
  `auto_import_customers`, `auto_import_complete_data`, and
  `auto_sync_enabled`.

Client roles may no longer:
- Insert connection rows.
- Delete connection rows.
- Write access_token or refresh_token.
- Change realm_id, organization_id, environment, is_connected, token expiry,
  company name, sync health, sync timestamps, errors, or token version.

Trusted server-side functions continue to use the service role for OAuth,
token refresh, disconnect, webhook processing, and reconciliation.

## Security

- Revoke table-wide INSERT, UPDATE, and DELETE from anon and authenticated.
- Grant authenticated UPDATE only on the three sync preference columns.
- Do not grant any secret-column access to browser roles.
- No existing data is changed or deleted.
*/

REVOKE INSERT, UPDATE, DELETE ON quickbooks_settings FROM anon, authenticated;

GRANT UPDATE (
  auto_import_customers,
  auto_import_complete_data,
  auto_sync_enabled
) ON quickbooks_settings TO authenticated;
