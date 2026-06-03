/*
  # Add 'manager' role to profiles role constraint

  1. Changes
    - Drop existing role check constraint on profiles table
    - Add new constraint that includes 'manager' role
    - This allows creating users with the 'manager' role

  2. Security
    - No changes to RLS policies
    - Only updates the allowed role values
*/

-- Drop the existing role check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new constraint with 'manager' included
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
CHECK (role = ANY (ARRAY['admin'::text, 'sales'::text, 'bd'::text, 'technician'::text, 'portal_user'::text, 'project_manager'::text, 'manager'::text]));