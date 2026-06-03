/*
  # Add labor_phase_id to proposal_line_items

  1. Changes
    - Add `labor_phase_id` uuid column to proposal_line_items
    - Add foreign key reference to labor_phases table
    - Keep existing `labor_phase` text column for backward compatibility

  2. Notes
    - labor_phase_id is optional (nullable)
    - This allows line items to reference labor phases from the labor_phases table
    - The text column can be deprecated later once all code uses the FK
*/

DO $$
BEGIN
  -- Add labor_phase_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'labor_phase_id'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN labor_phase_id uuid;
  END IF;
END $$;

-- Add foreign key constraint to labor_phases table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'labor_phases'
  ) THEN
    -- Add foreign key if it doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'proposal_line_items_labor_phase_id_fkey'
    ) THEN
      ALTER TABLE proposal_line_items
        ADD CONSTRAINT proposal_line_items_labor_phase_id_fkey
        FOREIGN KEY (labor_phase_id)
        REFERENCES labor_phases(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_labor_phase_id
  ON proposal_line_items(labor_phase_id);
