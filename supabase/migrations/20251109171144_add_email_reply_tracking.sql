/*\n  # Add Email Reply Tracking\n\n  1. Changes to Tables\n    - `lead_messages`\n      - Add `email_message_id` (text) - Stores the email provider's message ID for tracking replies\n      - Add `is_email_reply` (boolean) - Indicates if this message came from an email reply\n      - Add `replied_to_message_id` (uuid) - References the original message this is replying to\n  \n  2. New Index\n    - Add index on `email_message_id` for fast lookups when processing inbound emails\n  \n  3. Notes\n    - Email message IDs allow us to track conversation threads\n    - When users reply to notification emails, we can match their reply to the original message\n    - This enables seamless two-way communication via email\n*/\n\n-- Add email tracking columns to lead_messages\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'lead_messages' AND column_name = 'email_message_id'\n  ) THEN\n    ALTER TABLE lead_messages ADD COLUMN email_message_id text

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'lead_messages' AND column_name = 'is_email_reply'\n  ) THEN\n    ALTER TABLE lead_messages ADD COLUMN is_email_reply boolean DEFAULT false

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'lead_messages' AND column_name = 'replied_to_message_id'\n  ) THEN\n    ALTER TABLE lead_messages ADD COLUMN replied_to_message_id uuid REFERENCES lead_messages(id) ON DELETE SET NULL

\n  END IF

\nEND $$

\n\n-- Create index for email message ID lookups\nCREATE INDEX IF NOT EXISTS idx_lead_messages_email_message_id ON lead_messages(email_message_id)


