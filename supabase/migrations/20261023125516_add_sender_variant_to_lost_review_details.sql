/*
# Add sender_variant column to lost_review_details

1. Purpose
   The lost_review_details table currently does not store which sender variant
   (sales rep vs owner) was used when a lost opportunity email was sent.
   This column lets the send history display who the email was sent from,
   matching how the proposal_check_emails table already tracks `variant`.

2. Changes
   - Add `sender_variant` column (text, NOT NULL, default 'sales') to lost_review_details.
     Existing rows default to 'sales' (the most common variant).
   - A CHECK constraint ensures only 'sales' or 'owner' are accepted.

3. Security
   - No RLS or policy changes needed — the table already has RLS enabled.
   - The column is written by the edge function using the service role key,
     which bypasses RLS. Frontend reads it through existing SELECT policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lost_review_details'
      AND column_name = 'sender_variant'
  ) THEN
    ALTER TABLE lost_review_details
      ADD COLUMN sender_variant text NOT NULL DEFAULT 'sales';
    ALTER TABLE lost_review_details
      ADD CONSTRAINT lost_review_details_sender_variant_check
      CHECK (sender_variant IN ('sales', 'owner'));
  END IF;
END $$;