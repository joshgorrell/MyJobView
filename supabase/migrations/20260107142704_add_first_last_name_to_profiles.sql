/*
  # Add First Name and Last Name Fields to Profiles

  1. Changes
    - Add first_name column (optional, for QuickBooks payroll integration)
    - Add last_name column (optional, for QuickBooks payroll integration)
    - Keep full_name as the primary display name
    - These fields are useful for payroll systems and formal documents

  2. Notes
    - full_name remains the primary field used throughout the app
    - first_name and last_name are optional additional fields
    - Helpful for QuickBooks integration and payroll processing
*/

-- Add first_name and last_name columns
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text;

-- Create indexes for searching
CREATE INDEX IF NOT EXISTS idx_profiles_first_name ON profiles(first_name);
CREATE INDEX IF NOT EXISTS idx_profiles_last_name ON profiles(last_name);

COMMENT ON COLUMN profiles.first_name IS 'Optional first name for QuickBooks payroll and formal documents';
COMMENT ON COLUMN profiles.last_name IS 'Optional last name for QuickBooks payroll and formal documents';
