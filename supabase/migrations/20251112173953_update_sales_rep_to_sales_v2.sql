/*
  # Update role 'sales_rep' to 'sales'

  1. Changes
    - Drop the old CHECK constraint
    - Update all existing profiles with role 'sales_rep' to 'sales'
    - Add new CHECK constraint to use 'sales' instead of 'sales_rep'
    - Update default role value from 'sales_rep' to 'sales'

  2. Notes
    - This is a non-destructive change that renames the role
    - All existing users with 'sales_rep' role will be updated to 'sales'
    - The constraint ensures only valid roles can be used going forward
*/

-- Drop the old constraint first
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Now update all existing sales_rep records to sales
UPDATE profiles SET role = 'sales' WHERE role = 'sales_rep';

-- Add new constraint with updated role value
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'sales', 'bd'));

-- Update the default value
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'sales';