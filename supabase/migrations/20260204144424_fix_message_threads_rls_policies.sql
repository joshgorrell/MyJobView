/*
  # Fix Message Threads RLS Policies
  
  1. Issues Fixed
    - Remove conflicting SELECT policies on message_threads
    - Keep only the unified messaging system policies
    - Fix company_id check to work with single-tenant setup
  
  2. Changes
    - Drop old/conflicting policies
    - Update company_id checks to be permissive for single-tenant
    - Ensure staff can view threads based on visibility scope
*/

-- Drop old conflicting policies
DROP POLICY IF EXISTS "Staff can view threads in their company" ON message_threads;
DROP POLICY IF EXISTS "Staff can create threads in their company" ON message_threads;
DROP POLICY IF EXISTS "Staff can update threads in their company" ON message_threads;
DROP POLICY IF EXISTS "Staff can delete threads in their company" ON message_threads;
DROP POLICY IF EXISTS "Users can view company message threads" ON message_threads;
DROP POLICY IF EXISTS "Users can insert company message threads" ON message_threads;
DROP POLICY IF EXISTS "Users can update company message threads" ON message_threads;

-- Keep the unified messaging SELECT policy (already exists from our migration)
-- "Staff can view accessible message threads" - this is the correct one

-- Create simplified INSERT policy for staff
CREATE POLICY "Authenticated users can create message threads"
  ON message_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Staff members can create threads
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND contact_id IS NULL)
  );

-- Create simplified UPDATE policy for staff
CREATE POLICY "Authenticated users can update their message threads"
  ON message_threads FOR UPDATE
  TO authenticated
  USING (
    -- Staff can update threads they created or have access to
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  )
  WITH CHECK (
    -- Same as USING clause
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- Create simplified DELETE policy for staff
CREATE POLICY "Authenticated users can delete their message threads"
  ON message_threads FOR DELETE
  TO authenticated
  USING (
    -- Only creator or admins can delete
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );
