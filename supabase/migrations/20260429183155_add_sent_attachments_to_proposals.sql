/*
  # Add sent_attachments tracking to proposals

  ## Summary
  Adds a `sent_attachments` jsonb column to the proposals table to record
  which document types were included when a proposal was last emailed.

  ## New Columns
  - `proposals.sent_attachments` (jsonb, nullable) — records which PDFs were
    attached on the most recent send, e.g.:
    `{ "proposal": true, "terms": true, "payment_schedule": false, "financing": false }`

  ## Notes
  - Nullable; null means the proposal has never been emailed or was emailed
    before this feature was added.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'sent_attachments'
  ) THEN
    ALTER TABLE proposals ADD COLUMN sent_attachments jsonb;
  END IF;
END $$;
