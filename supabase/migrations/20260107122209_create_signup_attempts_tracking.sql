/*
  # Create Signup Attempts Tracking System

  1. New Tables
    - `signup_attempts`
      - `id` (uuid, primary key)
      - `email` (text, indexed)
      - `first_name` (text)
      - `last_name` (text)
      - `phone` (text)
      - `street_address` (text)
      - `city` (text)
      - `state` (text)
      - `zip_code` (text)
      - `selected_plan_id` (uuid, nullable)
      - `current_step` (text) - 'info', 'plan', 'payment'
      - `status` (text) - 'in_progress', 'abandoned', 'completed'
      - `contact_id` (uuid, nullable) - if they completed and contact was created
      - `last_activity_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `signup_attempts` table
    - Admin roles can view and delete signup attempts
    - Anonymous users can insert/update their own attempts (by email)
*/

CREATE TABLE IF NOT EXISTS signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  street_address text,
  city text,
  state text,
  zip_code text,
  selected_plan_id uuid REFERENCES recurring_plans(id) ON DELETE SET NULL,
  current_step text NOT NULL DEFAULT 'info' CHECK (current_step IN ('info', 'plan', 'payment')),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'abandoned', 'completed')),
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_signup_attempts_email ON signup_attempts(email);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_status ON signup_attempts(status);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_last_activity ON signup_attempts(last_activity_at);

-- Enable RLS
ALTER TABLE signup_attempts ENABLE ROW LEVEL SECURITY;

-- Admin can view all signup attempts
CREATE POLICY "Admins can view all signup attempts"
  ON signup_attempts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Admin can delete signup attempts
CREATE POLICY "Admins can delete signup attempts"
  ON signup_attempts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Anonymous users can insert signup attempts
CREATE POLICY "Anonymous can insert signup attempts"
  ON signup_attempts FOR INSERT
  TO anon
  WITH CHECK (true);

-- Anonymous users can update their own signup attempts (by email match within last 24 hours)
CREATE POLICY "Anonymous can update recent signup attempts by email"
  ON signup_attempts FOR UPDATE
  TO anon
  USING (
    email = current_setting('request.jwt.claims', true)::json->>'email'
    OR created_at > now() - interval '24 hours'
  )
  WITH CHECK (
    email = current_setting('request.jwt.claims', true)::json->>'email'
    OR created_at > now() - interval '24 hours'
  );

-- Authenticated users can update signup attempts
CREATE POLICY "Authenticated can update signup attempts"
  ON signup_attempts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to mark old in-progress signups as abandoned (run this as a scheduled job)
CREATE OR REPLACE FUNCTION mark_abandoned_signups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE signup_attempts
  SET status = 'abandoned'
  WHERE status = 'in_progress'
  AND last_activity_at < now() - interval '24 hours';
END;
$$;
