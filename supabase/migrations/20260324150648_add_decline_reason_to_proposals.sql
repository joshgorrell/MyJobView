/*\n  # Add decline_reason to proposals table\n\n  ## Summary\n  Adds a `decline_reason` column to the `proposals` table to track why proposals\n  are declined. This enables reporting on common decline reasons and sales insights.\n\n  ## Changes\n\n  ### Modified Tables\n  - `proposals`\n    - `decline_reason` (text, nullable) - Free-text or categorized reason for declining\n    - `declined_by` (uuid, nullable, FK -> auth.users) - Who declined the proposal\n\n  ## Notes\n  - Both fields are nullable to avoid breaking existing declined proposals\n  - No RLS changes needed

 existing proposal policies cover these new columns\n*/\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'proposals' AND column_name = 'decline_reason'\n  ) THEN\n    ALTER TABLE proposals ADD COLUMN decline_reason TEXT

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'proposals' AND column_name = 'declined_by'\n  ) THEN\n    ALTER TABLE proposals ADD COLUMN declined_by UUID REFERENCES auth.users(id) ON DELETE SET NULL

\n  END IF

\nEND $$

\n\nCREATE INDEX IF NOT EXISTS idx_proposals_decline_reason ON proposals(decline_reason) WHERE decline_reason IS NOT NULL

\n
