/*
  # Create Issue Tracker Schema

  1. New Tables
    - `issue_reports`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `title` (text) - Brief summary of the issue
      - `description` (text) - Detailed description
      - `issue_type` (text) - 'bug', 'feature_request', 'question', 'other'
      - `priority` (text) - 'low', 'medium', 'high', 'critical'
      - `status` (text) - 'open', 'in_progress', 'resolved', 'closed'
      - `page_url` (text) - Where the issue occurred
      - `browser_info` (text) - Browser/device info
      - `screenshot_url` (text, optional) - Link to screenshot if uploaded
      - `admin_notes` (text, optional) - Internal notes from admin
      - `resolved_at` (timestamptz, optional)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `issue_reports` table
    - Users can create and view their own issues
    - Admins can view and manage all issues
    
  3. Indexes
    - Index on user_id for faster lookups
    - Index on status for admin filtering
    - Index on created_at for sorting
*/

-- Create issue_reports table
CREATE TABLE IF NOT EXISTS issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL CHECK (length(title) > 0),
  description text NOT NULL CHECK (length(description) > 0),
  issue_type text NOT NULL CHECK (issue_type IN ('bug', 'feature_request', 'question', 'other')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  page_url text,
  browser_info text,
  screenshot_url text,
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE issue_reports ENABLE ROW LEVEL SECURITY;

-- Users can create issues
CREATE POLICY "Users can create issues"
  ON issue_reports FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can view their own issues
CREATE POLICY "Users can view own issues"
  ON issue_reports FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all issues
CREATE POLICY "Admins can view all issues"
  ON issue_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can update all issues
CREATE POLICY "Admins can update all issues"
  ON issue_reports FOR UPDATE
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

-- Users can update their own open issues
CREATE POLICY "Users can update own open issues"
  ON issue_reports FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() 
    AND status = 'open'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'open'
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_issue_reports_user_id ON issue_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_issue_reports_status ON issue_reports(status);
CREATE INDEX IF NOT EXISTS idx_issue_reports_created_at ON issue_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_reports_issue_type ON issue_reports(issue_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_issue_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status IN ('resolved', 'closed') AND OLD.status NOT IN ('resolved', 'closed') THEN
    NEW.resolved_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to auto-update timestamps
DROP TRIGGER IF EXISTS trigger_update_issue_reports_updated_at ON issue_reports;
CREATE TRIGGER trigger_update_issue_reports_updated_at
  BEFORE UPDATE ON issue_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_issue_reports_updated_at();