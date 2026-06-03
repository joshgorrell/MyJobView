/*
  # Add Promotional Access Type to Punchlist System

  1. Changes
    - Add 'promotional' as a third valid access_type to punchlist_access_grants
    - This enables three distinct access methods:
      * 'test_and_tune': 90-day program from project completion
      * 'vip_membership': Linked to active VIP subscription
      * 'promotional': Direct invite sent by staff/sales for marketing purposes
    
  2. Security
    - Maintains existing RLS policies
    - No changes to access control logic, only expands available types
*/

-- Drop the existing constraint
ALTER TABLE punchlist_access_grants 
DROP CONSTRAINT IF EXISTS punchlist_access_grants_access_type_check;

-- Add the new constraint with all three access types
ALTER TABLE punchlist_access_grants 
ADD CONSTRAINT punchlist_access_grants_access_type_check 
CHECK (access_type IN ('test_and_tune', 'vip_membership', 'promotional'));
