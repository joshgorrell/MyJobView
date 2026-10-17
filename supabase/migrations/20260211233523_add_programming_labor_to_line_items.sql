/*\n  # Add Programming Labor Fields to Proposal Line Items\n\n  1. Changes to `proposal_line_items` table\n    - `programming_labor_hours` (numeric) - Hours for programming labor phase\n    - `programming_notes` (text) - Customer-facing programming instructions\n    - `show_programming_notes` (boolean) - Whether to display programming notes to customer\n\n  2. Changes to `products` table\n    - `default_programming_hours` (numeric) - Default programming time for this product\n    - `default_programming_notes` (text) - Default programming instructions\n\n  3. Purpose\n    - Enable items to have both install labor AND programming labor\n    - Simplify workflow for the two most common labor phases\n    - Support "Save to Master" for programming defaults\n    - Allow per-item programming customization\n\n  4. Notes\n    - Install notes continue to use existing `task_notes` field\n    - Programming labor auto-calculates using "Programming" labor phase rate\n    - Fields are nullable for backward compatibility\n    - Both phases can exist on same item simultaneously\n*/\n\n-- Add programming labor fields to proposal_line_items\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'proposal_line_items' AND column_name = 'programming_labor_hours'\n  ) THEN\n    ALTER TABLE proposal_line_items\n    ADD COLUMN programming_labor_hours numeric(10,2) DEFAULT NULL

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'proposal_line_items' AND column_name = 'programming_notes'\n  ) THEN\n    ALTER TABLE proposal_line_items\n    ADD COLUMN programming_notes text DEFAULT NULL

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'proposal_line_items' AND column_name = 'show_programming_notes'\n  ) THEN\n    ALTER TABLE proposal_line_items\n    ADD COLUMN show_programming_notes boolean DEFAULT false

\n  END IF

\nEND $$

\n\n-- Add default programming fields to products\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'products' AND column_name = 'default_programming_hours'\n  ) THEN\n    ALTER TABLE products\n    ADD COLUMN default_programming_hours numeric(10,2) DEFAULT NULL

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'products' AND column_name = 'default_programming_notes'\n  ) THEN\n    ALTER TABLE products\n    ADD COLUMN default_programming_notes text DEFAULT NULL

\n  END IF

\nEND $$

\n\n-- Add helpful comment\nCOMMENT ON COLUMN proposal_line_items.programming_labor_hours IS 'Hours for programming labor phase - auto-calculates using programming phase rate'

\nCOMMENT ON COLUMN proposal_line_items.programming_notes IS 'Customer-facing programming instructions (visible on reports when show_programming_notes is true)'

\nCOMMENT ON COLUMN proposal_line_items.show_programming_notes IS 'Whether to display programming notes to customer on proposal PDF'

\nCOMMENT ON COLUMN products.default_programming_hours IS 'Default programming hours when this product is added to proposals'

\nCOMMENT ON COLUMN products.default_programming_notes IS 'Default programming instructions when this product is added to proposals'

\n
