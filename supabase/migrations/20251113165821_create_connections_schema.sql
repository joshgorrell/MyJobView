/*
  # Create connections tracking schema

  1. New Tables
    - `connections`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles) - employee who had the connection
      - `contact_id` (uuid, foreign key to contacts) - contact they connected with
      - `connection_type` (text) - meeting, call, email, casual_conversation, other
      - `connection_date` (timestamptz) - when the connection happened
      - `notes` (text) - details about the interaction
      - `follow_up_needed` (boolean) - whether a follow-up is needed
      - `reminder_date` (timestamptz) - optional reminder for next meeting
      - `lead_created` (boolean) - whether a lead was created from this connection
      - `lead_id` (uuid, foreign key to leads) - optional link to created lead
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `connections` table
    - Add policies for users to manage their own connections
    - Admin can view all connections
*/

-- Create connections table
CREATE TABLE IF NOT EXISTS connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  connection_type text NOT NULL CHECK (connection_type IN ('meeting', 'call', 'email', 'casual_conversation', 'other')),
  connection_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  follow_up_needed boolean DEFAULT false,
  reminder_date timestamptz,
  lead_created boolean DEFAULT false,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Policies for connections
CREATE POLICY "Users can view their own connections"
  ON connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all connections"
  ON connections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can create their own connections"
  ON connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connections"
  ON connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connections"
  ON connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_connections_user_id ON connections(user_id);
CREATE INDEX IF NOT EXISTS idx_connections_contact_id ON connections(contact_id);
CREATE INDEX IF NOT EXISTS idx_connections_date ON connections(connection_date DESC);
CREATE INDEX IF NOT EXISTS idx_connections_reminder ON connections(reminder_date) WHERE reminder_date IS NOT NULL;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_connections_updated_at
  BEFORE UPDATE ON connections
  FOR EACH ROW
  EXECUTE FUNCTION update_connections_updated_at();