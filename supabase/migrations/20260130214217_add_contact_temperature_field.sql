/*\n  # Add Temperature Field to Contacts\n\n  1. Changes\n    - Add `temperature` field to contacts table\n    - Values: 'hot', 'warm', 'cold'\n    - Hot = Ready to buy, urgent action needed\n    - Warm = Interested, engaged, good potential\n    - Cold = Initial contact, low engagement, long-term nurture\n    - Default to 'cold' for new contacts\n    - Only applicable to prospects and leads (not regular customers)\n\n  2. Notes\n    - This allows tracking engagement level for both prospects and leads\n    - Some prospects may be warmer than others\n    - Some leads may be hotter than others\n    - Temperature can be updated as engagement changes\n*/\n\n-- Add temperature field to contacts\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'contacts' AND column_name = 'temperature'\n  ) THEN\n    ALTER TABLE contacts \n    ADD COLUMN temperature text CHECK (temperature IN ('hot', 'warm', 'cold')) DEFAULT 'cold'

\n    \n    -- Add index for filtering by temperature\n    CREATE INDEX IF NOT EXISTS idx_contacts_temperature ON contacts(temperature)

\n  END IF

\nEND $$


