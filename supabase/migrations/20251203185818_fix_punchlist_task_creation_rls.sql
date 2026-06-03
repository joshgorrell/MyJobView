/*
  # Fix Punchlist Task Creation RLS Policy

  ## Summary
  Updates the INSERT policy for punchlist_tasks to allow both portal users AND staff members
  to create tasks. This enables:
  - Portal users to create their own tasks
  - Staff members to create tasks on behalf of customers (when previewing portal)
  - Staff members to manually create tasks for customers

  ## Changes
  1. Drop the existing restrictive INSERT policy
  2. Create new policies that allow:
     - Portal users to create tasks for their own contact_id
     - Staff members to create tasks for any contact_id

  ## Security
  - Portal users can only create tasks with their own contact_id
  - Staff members (admin, office_manager, production_manager, dispatch) can create tasks for any customer
  - All other RLS policies remain unchanged
*/

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Portal users can create punchlist tasks" ON punchlist_tasks;

-- Portal users can create their own tasks
CREATE POLICY "Portal users can create their own punchlist tasks"
  ON punchlist_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = punchlist_tasks.contact_id
    )
  );

-- Staff can create tasks for any customer
CREATE POLICY "Staff can create punchlist tasks for customers"
  ON punchlist_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'production_manager', 'dispatch', 'sales_manager')
    )
  );
