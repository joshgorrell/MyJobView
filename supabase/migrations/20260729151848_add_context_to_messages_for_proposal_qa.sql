/*
# Add room/item context to proposal Q&A messages

1. Purpose
   Allows customers to ask questions tied to a specific room or line item in a proposal.
   When a customer clicks "Ask about this room" or the question icon on a line item,
   the message is tagged with that context so the sales rep knows exactly what is being asked about.

2. Changes to existing table `messages`
   - `context_room_id` (uuid, nullable) — FK to `proposal_rooms.id`. When set, the message is about that room.
   - `context_line_item_id` (uuid, nullable) — FK to `proposal_line_items.id`. When set, the message is about that line item.
   - `context_label` (text, nullable) — human-readable label for the context (e.g. "Living Room" or "65-inch TV") so the UI can display it without extra joins.

3. Security
   - No new tables. Existing RLS policies on `messages` remain unchanged and continue to govern access.
   - The new columns are nullable and optional — existing messages are unaffected.
*/

-- Add context columns to messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'context_room_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN context_room_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'context_line_item_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN context_line_item_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'context_label'
  ) THEN
    ALTER TABLE messages ADD COLUMN context_label text;
  END IF;
END $$;

-- Add foreign key constraints (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_context_room_id_fkey'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_context_room_id_fkey
      FOREIGN KEY (context_room_id) REFERENCES proposal_rooms(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_context_line_item_id_fkey'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_context_line_item_id_fkey
      FOREIGN KEY (context_line_item_id) REFERENCES proposal_line_items(id) ON DELETE SET NULL;
  END IF;
END $$;
