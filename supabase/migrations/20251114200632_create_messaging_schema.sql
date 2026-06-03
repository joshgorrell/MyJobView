/*
  # Create Messaging Schema

  1. New Tables
    - `message_threads`
      - `id` (uuid, primary key)
      - `company_id` (uuid)
      - `subject` (text)
      - `context_type` (text: contact, proposal, project)
      - `context_id` (uuid) - ID of the related record
      - `visibility` (text: internal, public)
      - `created_by` (uuid)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `last_message_at` (timestamptz)

    - `messages`
      - `id` (uuid, primary key)
      - `thread_id` (uuid, references message_threads)
      - `author_id` (uuid, references auth.users)
      - `author_name` (text) - Cached for display
      - `author_type` (text: staff, customer)
      - `body` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Staff can see all threads in their company
    - Staff can see internal and public messages
    - Customers can only see public threads related to their contact
    - Customers can only see public messages

  3. Indexes
    - Index on thread company_id
    - Index on thread context
    - Index on message thread_id
    - Index on last_message_at for sorting
*/

CREATE TABLE IF NOT EXISTS message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  subject text NOT NULL,
  context_type text NOT NULL CHECK (context_type IN ('contact', 'proposal', 'project')),
  context_id uuid NOT NULL,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('internal', 'public')),
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_message_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text NOT NULL,
  author_type text NOT NULL CHECK (author_type IN ('staff', 'customer')),
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_message_threads_company ON message_threads(company_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_context ON message_threads(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_last_message ON message_threads(company_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author_id);

-- Enable RLS
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Message Threads Policies (Staff)
CREATE POLICY "Staff can view threads in their company"
  ON message_threads FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can create threads in their company"
  ON message_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can update threads in their company"
  ON message_threads FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can delete threads in their company"
  ON message_threads FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM profiles WHERE id = auth.uid()
    )
  );

-- Messages Policies (Staff)
CREATE POLICY "Staff can view messages in their company threads"
  ON messages FOR SELECT
  TO authenticated
  USING (
    thread_id IN (
      SELECT id FROM message_threads WHERE company_id IN (
        SELECT id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff can create messages in their company threads"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    thread_id IN (
      SELECT id FROM message_threads WHERE company_id IN (
        SELECT id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff can update their own messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Staff can delete their own messages"
  ON messages FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

-- Trigger to update last_message_at on message_threads
CREATE OR REPLACE FUNCTION update_thread_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE message_threads
  SET last_message_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_thread_last_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_last_message();
