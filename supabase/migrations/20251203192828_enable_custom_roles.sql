/*
  # Enable Custom Role Creation

  ## Overview
  Remove the CHECK constraint on roles.role_key to allow admins to create custom roles
  beyond the 5 system roles.

  ## Changes
  1. Drop the existing CHECK constraint on role_key
  2. Keep the UNIQUE constraint to prevent duplicates
  3. Allow custom role_key values for flexibility

  ## Notes
  - System roles (is_system_role = true) cannot be deleted
  - Custom roles (is_system_role = false) can be fully managed by admins
*/

-- Drop the CHECK constraint on role_key to allow custom roles
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_role_key_check;

-- Add a CHECK to ensure role_key is not empty and follows naming convention
ALTER TABLE roles ADD CONSTRAINT roles_role_key_format 
  CHECK (role_key ~ '^[a-z][a-z0-9_]*$' AND length(role_key) >= 2 AND length(role_key) <= 50);

-- Add a constraint to prevent deletion/deactivation of system roles via policies
-- (System roles are protected by application logic)