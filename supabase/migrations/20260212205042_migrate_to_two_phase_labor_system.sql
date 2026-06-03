/*
  # Migrate to Two-Phase Labor System

  ## Summary
  Converts existing single-phase labor data from proposal_line_items into the
  proposal_line_item_labor_phases junction table to support the new two-phase
  labor system (primary phase + optional programming phase).

  ## Changes Made
  1. **Data Migration**
     - Migrates labor_phase_id, labor_hours, and task_notes to junction table as primary phase (sort_order = 0)
     - Migrates programming_labor_hours and programming_notes to junction table as programming phase (sort_order = 1)
     - Preserves all existing labor configurations
     - Includes organization_id from proposal_line_items

  2. **New Columns**
     - Adds programming_labor_hours, programming_notes, show_programming_notes to proposal_line_items if they don't exist
     - These will be deprecated after migration but kept for backward compatibility during transition

  3. **Validation**
     - Only migrates records with valid phase IDs and hours > 0
     - Ensures data integrity during migration

  ## Important Notes
  - Existing data is preserved in legacy columns during transition period
  - Junction table becomes the source of truth for labor phases
  - Task generation trigger already uses junction table
  - No data loss occurs during this operation
*/

-- Step 1: Add programming-related columns to proposal_line_items if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'programming_labor_hours'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN programming_labor_hours numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'programming_notes'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN programming_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'show_programming_notes'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN show_programming_notes boolean DEFAULT false;
  END IF;
END $$;

-- Step 2: Find the Programming labor phase ID
DO $$
DECLARE
  v_programming_phase_id uuid;
  v_migrated_count integer := 0;
  v_programming_count integer := 0;
BEGIN
  -- Get Programming phase ID
  SELECT id INTO v_programming_phase_id
  FROM labor_phases
  WHERE LOWER(name) = 'programming'
  LIMIT 1;

  -- Migrate primary labor phases (labor_phase_id + labor_hours + task_notes)
  -- Only migrate if not already in junction table
  INSERT INTO proposal_line_item_labor_phases (
    line_item_id,
    labor_phase_id,
    hours,
    tech_notes,
    sort_order,
    organization_id,
    created_at,
    updated_at
  )
  SELECT
    pli.id,
    pli.labor_phase_id,
    pli.labor_hours,
    pli.task_notes,
    0, -- Primary phase is always sort_order 0
    pli.organization_id,
    pli.created_at,
    now()
  FROM proposal_line_items pli
  WHERE pli.labor_phase_id IS NOT NULL
    AND pli.labor_hours > 0
    AND NOT EXISTS (
      SELECT 1 FROM proposal_line_item_labor_phases plilp
      WHERE plilp.line_item_id = pli.id
        AND plilp.sort_order = 0
    );

  GET DIAGNOSTICS v_migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % primary labor phases to junction table', v_migrated_count;

  -- Migrate programming labor phases (programming_labor_hours + programming_notes)
  -- Only if Programming phase exists
  IF v_programming_phase_id IS NOT NULL THEN
    INSERT INTO proposal_line_item_labor_phases (
      line_item_id,
      labor_phase_id,
      hours,
      tech_notes,
      sort_order,
      organization_id,
      created_at,
      updated_at
    )
    SELECT
      pli.id,
      v_programming_phase_id,
      pli.programming_labor_hours,
      pli.programming_notes,
      1, -- Programming phase is always sort_order 1
      pli.organization_id,
      pli.created_at,
      now()
    FROM proposal_line_items pli
    WHERE pli.programming_labor_hours > 0
      AND NOT EXISTS (
        SELECT 1 FROM proposal_line_item_labor_phases plilp
        WHERE plilp.line_item_id = pli.id
          AND plilp.sort_order = 1
      );

    GET DIAGNOSTICS v_programming_count = ROW_COUNT;
    RAISE NOTICE 'Migrated % programming labor phases to junction table', v_programming_count;
  ELSE
    RAISE NOTICE 'Programming phase not found - skipping programming labor migration';
  END IF;

  RAISE NOTICE 'Migration complete: % primary phases, % programming phases', v_migrated_count, v_programming_count;
END $$;

-- Step 3: Create index for efficient lookups by sort_order
CREATE INDEX IF NOT EXISTS idx_line_item_labor_phases_composite
  ON proposal_line_item_labor_phases(line_item_id, sort_order);

-- Step 4: Add helpful comment to legacy columns
COMMENT ON COLUMN proposal_line_items.labor_phase_id IS 'DEPRECATED: Use proposal_line_item_labor_phases junction table instead';
COMMENT ON COLUMN proposal_line_items.labor_hours IS 'DEPRECATED: Use proposal_line_item_labor_phases junction table instead';
COMMENT ON COLUMN proposal_line_items.task_notes IS 'DEPRECATED: Use proposal_line_item_labor_phases junction table instead';
COMMENT ON COLUMN proposal_line_items.programming_labor_hours IS 'DEPRECATED: Use proposal_line_item_labor_phases junction table instead';
COMMENT ON COLUMN proposal_line_items.programming_notes IS 'DEPRECATED: Use proposal_line_item_labor_phases junction table instead';

-- Step 5: Create function to get total labor hours from junction table
CREATE OR REPLACE FUNCTION get_line_item_total_labor_hours(p_line_item_id uuid)
RETURNS numeric AS $$
  SELECT COALESCE(SUM(hours), 0)
  FROM proposal_line_item_labor_phases
  WHERE line_item_id = p_line_item_id;
$$ LANGUAGE sql STABLE;

-- Step 6: Create function to get labor phase count for a line item
CREATE OR REPLACE FUNCTION get_line_item_phase_count(p_line_item_id uuid)
RETURNS integer AS $$
  SELECT COUNT(*)::integer
  FROM proposal_line_item_labor_phases
  WHERE line_item_id = p_line_item_id AND hours > 0;
$$ LANGUAGE sql STABLE;