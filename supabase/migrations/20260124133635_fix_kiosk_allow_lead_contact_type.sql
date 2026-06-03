/*
  # Fix Kiosk Contact Creation - Allow 'lead' Contact Type

  1. Changes
    - Drop the existing policy that only allows 'person' contact_type
    - Add a new policy that allows both 'person' and 'lead' contact types
    - This allows the tradeshow kiosk to create contacts with contact_type = 'lead'

  2. Security
    - Still restricts anonymous users to only INSERT (cannot read/update/delete)
    - Requires essential contact information (email, name, phone)
    - Allows both 'person' and 'lead' contact types for flexibility
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Anonymous users can create contacts for kiosk and VIP" ON contacts;

-- Create a new policy that allows both 'person' and 'lead' contact types
CREATE POLICY "Anonymous users can create contacts for kiosk and VIP"
  ON contacts
  FOR INSERT
  TO anon
  WITH CHECK (
    -- Require email, phone, and contact type
    email IS NOT NULL
    AND phone IS NOT NULL
    AND contact_type IN ('person', 'lead')
    AND (
      -- Either contact_name is provided
      contact_name IS NOT NULL
      OR
      -- Or both first_name and last_name are provided
      (first_name IS NOT NULL AND last_name IS NOT NULL)
    )
  );
