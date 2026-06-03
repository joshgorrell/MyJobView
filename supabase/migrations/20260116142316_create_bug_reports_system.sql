/*
  # Create Bug Reports System

  1. New Tables
    - `bug_reports`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users) - who reported the bug
      - `description` (text) - bug description
      - `is_fixed` (boolean) - whether the bug has been fixed
      - `created_at` (timestamptz) - when the bug was reported

  2. Security
    - Enable RLS on `bug_reports` table
    - Add policy for authenticated users to insert their own bug reports
    - Add policy for authenticated users to view their own bug reports
    - Add policy for admins to view all bug reports
    - Add policy for admins to update bug reports (mark as fixed)

  3. Indexes
    - Add index on `created_at` for sorting
    - Add index on `user_id` for filtering
    - Add index on `is_fixed` for filtering
*/

-- Create bug_reports table
CREATE TABLE IF NOT EXISTS bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  description text NOT NULL,
  is_fixed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON bug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_is_fixed ON bug_reports(is_fixed);

-- Policy: Authenticated users can insert bug reports
CREATE POLICY "Authenticated users can create bug reports"
  ON bug_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own bug reports
CREATE POLICY "Users can view own bug reports"
  ON bug_reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Admins can view all bug reports
CREATE POLICY "Admins can view all bug reports"
  ON bug_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Admins can update bug reports
CREATE POLICY "Admins can update bug reports"
  ON bug_reports
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );