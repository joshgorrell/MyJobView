/*
  # Allow Sales Department in Constraint

  ## Overview
  Updates the departments table constraint to allow 'sales' as a valid department name.

  ## Changes
  - Drop existing CHECK constraint on departments.name
  - Add new CHECK constraint that includes 'sales'
  - Preserves all existing departments
*/

-- Drop the old constraint
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_name_check;

-- Add new constraint with 'sales' included
ALTER TABLE departments ADD CONSTRAINT departments_name_check 
  CHECK (name IN ('pipeline', 'sales', 'production', 'dispatch', 'finance', 'admin'));
