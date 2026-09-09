/*
# QBO 1.1: Add Last Successful Sync Timestamp

## Summary

Adds the `last_synced_at` timestamp to `quickbooks_settings` so the
integration can show the last successful synchronization across customers,
invoices, and payments.

## Security

This is a non-secret status field. Authenticated organization members may
read it through the existing organization-scoped settings policy. No token
or credential access is changed.

## Data Safety

The column is nullable and no existing data is modified or deleted.
*/

ALTER TABLE quickbooks_settings
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

GRANT SELECT (last_synced_at) ON quickbooks_settings TO authenticated;
