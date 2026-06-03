/*
  # Fix User Starred Modules Insert Policy

  1. Changes
    - Simplify the INSERT policy for user_starred_modules
    - Remove complex department access checks from insert
    - Allow users to star any active module (validation happens in app layer)
    
  2. Security
    - Users can only insert their own starred modules (user_id = auth.uid())
    - Module must exist and be active
    - Star order must be between 1 and 6
*/

-- Drop the overly complex insert policy
DROP POLICY IF EXISTS "Users can insert own starred modules" ON user_starred_modules;

-- Create a simpler insert policy
CREATE POLICY "Users can insert own starred modules"
  ON user_starred_modules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND star_order BETWEEN 1 AND 6
    AND EXISTS (
      SELECT 1 FROM department_modules dm
      WHERE dm.id = module_id
      AND dm.is_active = true
    )
  );
