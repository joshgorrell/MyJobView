/*
  # Create Proposal Q&A Messaging System

  1. New Table
    - `proposal_messages` - real-time Q&A between sales reps and customers
      - `id` (uuid, primary key)
      - `proposal_id` (uuid, references proposals)
      - `sender_type` (text) - 'customer' or 'rep'
      - `sender_id` (uuid, references profiles or contacts)
      - `message` (text) - the question or answer
      - `parent_message_id` (uuid, optional) - for threaded replies
      - `is_read` (boolean) - track if message has been read
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Customers can view messages for their proposals
    - Sales reps can view all messages
    - Both can insert messages

  3. Indexes
    - proposal_id for fast lookup
    - created_at for ordering
*/

CREATE TABLE IF NOT EXISTS proposal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('customer', 'rep')),
  sender_id uuid,
  sender_name text NOT NULL,
  message text NOT NULL,
  parent_message_id uuid REFERENCES proposal_messages(id) ON DELETE SET NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_proposal_messages_proposal_id ON proposal_messages(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_messages_created_at ON proposal_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_messages_parent ON proposal_messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_proposal_messages_unread ON proposal_messages(is_read) WHERE is_read = false;

-- Enable RLS
ALTER TABLE proposal_messages ENABLE ROW LEVEL SECURITY;

-- Policies: Authenticated users (sales reps) can view all messages
CREATE POLICY "Sales reps can view all proposal messages"
  ON proposal_messages FOR SELECT
  TO authenticated
  USING (true);

-- Policies: Authenticated users can insert messages as reps
CREATE POLICY "Sales reps can send messages"
  ON proposal_messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_type = 'rep');

-- Policies: Authenticated users can mark messages as read
CREATE POLICY "Users can mark messages as read"
  ON proposal_messages FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Policies: Portal users (anon) can view messages for their proposals
CREATE POLICY "Customers can view their proposal messages"
  ON proposal_messages FOR SELECT
  TO anon
  USING (
    proposal_id IN (
      SELECT id FROM proposals
      WHERE status IN ('sent', 'viewed', 'approved', 'declined')
    )
  );

-- Policies: Portal users can send messages as customers
CREATE POLICY "Customers can send messages"
  ON proposal_messages FOR INSERT
  TO anon
  WITH CHECK (sender_type = 'customer');

-- Function to get unread message count for a proposal
CREATE OR REPLACE FUNCTION get_proposal_unread_count(p_proposal_id uuid, p_sender_type text)
RETURNS bigint AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM proposal_messages
    WHERE proposal_id = p_proposal_id
      AND sender_type != p_sender_type
      AND is_read = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_proposal_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER proposal_messages_updated_at
  BEFORE UPDATE ON proposal_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_proposal_messages_updated_at();
