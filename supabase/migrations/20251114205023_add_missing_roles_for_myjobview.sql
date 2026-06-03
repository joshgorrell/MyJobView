/*
  # Add Missing Roles for MyJobView System
  
  This migration adds the necessary roles to support the MyJobView feature set.
  
  ## Changes
  
  1. Roles Added to profiles.role constraint:
     - `technician` - Field workers who perform installations and service
     - `portal_user` - Customer portal users (linked via contact_id)
     - `project_manager` - Project managers who oversee jobs
  
  ## Existing Roles (Preserved)
     - `admin` - System administrators
     - `sales` - Sales representatives
     - `bd` - Business development
  
  ## Notes
  - Portal users should have both role='portal_user' AND contact_id set
  - Technicians can be assigned to appointments and projects
  - Project managers can manage projects and see commission data
*/

-- Drop the existing role constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new constraint with all roles
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role = ANY (ARRAY['admin'::text, 'sales'::text, 'bd'::text, 'technician'::text, 'portal_user'::text, 'project_manager'::text]));

-- Add index on role for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Add index on contact_id for portal user lookups
CREATE INDEX IF NOT EXISTS idx_profiles_contact_id ON profiles(contact_id) WHERE contact_id IS NOT NULL;
