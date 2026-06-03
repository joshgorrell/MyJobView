/*
  # Company Messages Ticker System

  1. New Tables
    - `company_messages`
      - `id` (uuid, primary key)
      - `message` (text) - The message content to display
      - `priority` (text) - Priority level: 'low', 'normal', 'high', 'urgent'
      - `type` (text) - Message type: 'news', 'alert', 'announcement', 'info'
      - `is_active` (boolean) - Whether message is currently displayed
      - `start_date` (timestamptz) - When message should start showing (nullable)
      - `end_date` (timestamptz) - When message should stop showing (nullable)
      - `created_by` (uuid, references profiles)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - All authenticated users can view active messages
    - Only admins can create/update/delete messages
*/

CREATE TABLE IF NOT EXISTS company_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('news', 'alert', 'announcement', 'info')),
  is_active boolean NOT NULL DEFAULT true,
  start_date timestamptz DEFAULT now(),
  end_date timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add index for active messages query
CREATE INDEX IF NOT EXISTS idx_company_messages_active ON company_messages(is_active, start_date, end_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_company_messages_created_by ON company_messages(created_by);

-- Enable RLS
ALTER TABLE company_messages ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view active messages
CREATE POLICY "All authenticated users can view active messages"
  ON company_messages FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date >= now())
  );

-- Admins can view all messages (for management interface)
CREATE POLICY "Admins can view all messages"
  ON company_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can insert messages
CREATE POLICY "Admins can insert messages"
  ON company_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can update messages
CREATE POLICY "Admins can update messages"
  ON company_messages FOR UPDATE
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

-- Admins can delete messages
CREATE POLICY "Admins can delete messages"
  ON company_messages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_company_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_company_messages_updated_at
  BEFORE UPDATE ON company_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_company_messages_updated_at();
