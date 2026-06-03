/*
  # Drop company_settings Table

  This migration removes the deprecated `company_settings` table after completing
  the multi-tenant migration to the `organizations` table.

  ## Changes Made
  
  1. Drop the `company_settings` table
     - All functionality has been migrated to the `organizations` table
     - All frontend components now use `organizations`
     - All edge functions now use `organizations`
     - All data has been migrated via previous migrations
  
  ## Migration Path
  
  This is the final step in the multi-tenant migration:
  - Phase 1: Created organizations table and migrated data
  - Phase 2: Updated all frontend components to use organizations
  - Phase 3: Updated all edge functions to use organizations
  - Phase 4: This migration - Remove deprecated table
  
  ## Column Mappings (for reference)
  
  Old company_settings → New organizations
  - company_name → name
  - company_email → primary_contact_email
  - company_phone → phone
  - company_address → address
  - company_logo_url → logo_url
  - All other fields retained same names
*/

-- Drop the company_settings table
DROP TABLE IF EXISTS company_settings CASCADE;
