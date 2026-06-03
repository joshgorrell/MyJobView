/*
  # Set QuickBooks to Manual Mode by Default

  1. Changes
    - Update existing quickbooks_settings records to disable auto-sync by default
    - Set auto_sync_enabled to false (manual sync only)
    - Set auto_import_complete_data to false (manual import only)
    - This ensures safe operation with production QuickBooks data

  2. Purpose
    - Prevents accidental writes to production QuickBooks
    - Requires explicit user action for all sync operations
    - Allows testing connection without affecting live data
    - Can be enabled later when ready for automatic operations
*/

-- Update any existing quickbooks_settings records to manual mode
UPDATE quickbooks_settings
SET
  auto_sync_enabled = false,
  auto_import_complete_data = false,
  updated_at = now()
WHERE auto_sync_enabled = true OR auto_import_complete_data = true;

-- Log the change
DO $$
DECLARE
  v_updated_count integer;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM quickbooks_settings
  WHERE auto_sync_enabled = false AND auto_import_complete_data = false;

  RAISE NOTICE 'QuickBooks settings updated to manual mode. % record(s) configured for safe operation.', v_updated_count;
END $$;
