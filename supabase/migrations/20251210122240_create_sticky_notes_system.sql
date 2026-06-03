/*
  # Create Sticky Notes System

  1. New Tables
    - `sticky_notes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `content` (text) - The note content
      - `color` (text) - Note color: yellow, pink, blue, green, orange
      - `pinned` (boolean) - Pin important notes to top
      - `archived` (boolean) - Archive completed notes
      - `converted_to_task_id` (uuid, nullable) - References tasks if converted
      - `converted_to_discussion_id` (uuid, nullable) - References discussion_posts if converted
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `sticky_notes`
    - Users can only view/edit their own sticky notes
    - Personal and private to each user

  3. Indexes
    - Index on user_id for fast lookups
    - Index on pinned and archived for filtering
*/

CREATE TABLE IF NOT EXISTS sticky_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  color text DEFAULT 'yellow' CHECK (color IN ('yellow', 'pink', 'blue', 'green', 'orange')),
  pinned boolean DEFAULT false,
  archived boolean DEFAULT false,
  converted_to_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  converted_to_discussion_id uuid REFERENCES discussion_posts(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sticky_notes_user_id ON sticky_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_sticky_notes_pinned ON sticky_notes(pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_sticky_notes_archived ON sticky_notes(archived);

-- Enable RLS
ALTER TABLE sticky_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access their own sticky notes
CREATE POLICY "Users can view own sticky notes"
  ON sticky_notes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sticky notes"
  ON sticky_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sticky notes"
  ON sticky_notes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sticky notes"
  ON sticky_notes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_sticky_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sticky_notes_updated_at
  BEFORE UPDATE ON sticky_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_sticky_notes_updated_at();