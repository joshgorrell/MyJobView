/*
  # Fix is_prospect synchronization with contact_type

  1. Changes
    - Create trigger to automatically sync is_prospect flag when contact_type changes
    - Ensure is_prospect is always consistent with contact_type
    - Update any existing mismatched records

  2. Purpose
    - Ensures show/hide prospects filter works correctly
    - Maintains data consistency automatically
*/

-- Function to sync is_prospect with contact_type
CREATE OR REPLACE FUNCTION sync_is_prospect_flag()
RETURNS TRIGGER AS $$
BEGIN
  -- Set is_prospect based on contact_type
  NEW.is_prospect := NEW.contact_type IN ('prospect', 'lead');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to run before insert or update on contacts
DROP TRIGGER IF EXISTS sync_is_prospect_trigger ON contacts;
CREATE TRIGGER sync_is_prospect_trigger
  BEFORE INSERT OR UPDATE OF contact_type
  ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION sync_is_prospect_flag();

-- Update any existing records that are out of sync
UPDATE contacts
SET is_prospect = (contact_type IN ('prospect', 'lead'))
WHERE is_prospect != (contact_type IN ('prospect', 'lead'));
