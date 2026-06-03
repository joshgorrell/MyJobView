/*
  # Migrate Work Orders from Labor Categories to Labor Phases v2

  1. Data Migration Strategy
    - Map work orders to existing labor phases based on their labor_category
    - Field Labor → Service phase (or any phase that counts_against_target = true)
    - PM Labor → Training phase (or any phase that counts_against_target = false)
    - Non-Performance Labor → Training phase (or any phase that counts_against_target = false)

  2. Schema Changes
    - Make labor_phase_id NOT NULL on work_orders after migration
    - Keep labor_category_id temporarily for reference

  3. Notes
    - Uses existing phases from the database
    - Only migrates work orders that don't already have a labor_phase_id
*/

-- Migrate Field Labor work orders → Use first available phase that counts against target
UPDATE work_orders wo
SET labor_phase_id = (
  SELECT lppm.labor_phase_id
  FROM labor_phase_performance_mapping lppm
  JOIN labor_phases lp ON lppm.labor_phase_id = lp.id
  WHERE lppm.counts_against_target = true
    AND lp.is_active = true
  ORDER BY lp.sort_order, lp.name
  LIMIT 1
)
WHERE wo.labor_phase_id IS NULL
  AND EXISTS (
    SELECT 1 FROM labor_categories lc
    WHERE lc.id = wo.labor_category_id
    AND LOWER(lc.name) = 'field labor'
  );

-- Migrate PM Labor and Non-Performance Labor → Use first available phase that doesn't count against target
UPDATE work_orders wo
SET labor_phase_id = (
  SELECT lppm.labor_phase_id
  FROM labor_phase_performance_mapping lppm
  JOIN labor_phases lp ON lppm.labor_phase_id = lp.id
  WHERE lppm.counts_against_target = false
    AND lp.is_active = true
  ORDER BY lp.sort_order, lp.name
  LIMIT 1
)
WHERE wo.labor_phase_id IS NULL
  AND EXISTS (
    SELECT 1 FROM labor_categories lc
    WHERE lc.id = wo.labor_category_id
    AND LOWER(lc.name) IN ('pm labor', 'non-performance labor')
  );

-- For any remaining work orders without labor_phase_id, assign default phase (counts against target)
UPDATE work_orders wo
SET labor_phase_id = (
  SELECT lppm.labor_phase_id
  FROM labor_phase_performance_mapping lppm
  JOIN labor_phases lp ON lppm.labor_phase_id = lp.id
  WHERE lppm.counts_against_target = true
    AND lp.is_active = true
  ORDER BY lp.sort_order, lp.name
  LIMIT 1
)
WHERE wo.labor_phase_id IS NULL;

-- Make labor_phase_id required (if there are still NULLs, this will fail and we need to investigate)
DO $$
BEGIN
  -- Check if any work orders still have NULL labor_phase_id
  IF EXISTS (SELECT 1 FROM work_orders WHERE labor_phase_id IS NULL) THEN
    RAISE EXCEPTION 'Some work orders still have NULL labor_phase_id after migration. Please investigate.';
  END IF;
  
  -- Make it NOT NULL
  ALTER TABLE work_orders
    ALTER COLUMN labor_phase_id SET NOT NULL;
END $$;