/*
  # Update QuickBooks Sync for Contacts

  1. Changes to Existing Tables
    - Update `quickbooks_synced_customers` to reference contacts instead of leads
    - Rename `lead_id` to `contact_id` for clarity
  
  2. Notes
    - QuickBooks customers now sync to contacts table
    - Contacts can later be converted to leads when needed
    - Preserves existing sync tracking
*/

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quickbooks_synced_customers' AND column_name = 'lead_id'
  ) THEN
    ALTER TABLE quickbooks_synced_customers 
    DROP CONSTRAINT IF EXISTS quickbooks_synced_customers_lead_id_fkey;
    
    ALTER TABLE quickbooks_synced_customers 
    RENAME COLUMN lead_id TO contact_id;
    
    ALTER TABLE quickbooks_synced_customers
    ADD CONSTRAINT quickbooks_synced_customers_contact_id_fkey 
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
  END IF;
END $$;
