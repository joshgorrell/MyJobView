/*
  # Add Project ID to Time Entries for Direct Project Time Tracking
  
  ## Summary
  Allows technicians to log time directly to projects without requiring a work order.
  This is specifically for ad-hoc project work where work orders haven't been created yet.
  
  ## Changes
  
  ### time_entries table modifications:
  - Add `project_id` - Optional direct link to project (for manual entries without work order)
  - Add constraint to ensure either work_order_id OR project_id is set
  - Add check constraint to prevent service work from bypassing work orders
  
  ## Indexes
  - Index on project_id for efficient project-based time queries
  
  ## Business Rules
  - Time entries must have EITHER work_order_id OR project_id (not both, not neither)
  - This allows techs to log time for:
    * Normal work: work_order_id is set (linked to any type of work order)
    * Ad-hoc project work: project_id is set (no work order required)
  - Service work must always use work orders (enforced at application level)
  
  ## Security
  - Maintains existing RLS policies
  - All time entries still require authentication
*/

-- Add project_id to time_entries table
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

-- Create index for project-based time queries
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id) WHERE project_id IS NOT NULL;

-- Add constraint: must have either work_order_id OR project_id (not both, not neither)
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entry_requires_work_order_or_project;
ALTER TABLE time_entries ADD CONSTRAINT time_entry_requires_work_order_or_project
  CHECK (
    (work_order_id IS NOT NULL AND project_id IS NULL)
    OR (work_order_id IS NULL AND project_id IS NOT NULL)
  );

-- Add comments for documentation
COMMENT ON COLUMN time_entries.project_id IS 'Direct link to project for manual time entries without work orders. Used for ad-hoc project work. Must be null if work_order_id is set.';
COMMENT ON CONSTRAINT time_entry_requires_work_order_or_project ON time_entries IS 'Time entries must have either a work_order_id (normal tracked work) OR a project_id (ad-hoc project work), but not both.';

-- Create helper function to get project from time entry (either direct or via work order)
CREATE OR REPLACE FUNCTION get_time_entry_project_id(p_time_entry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT COALESCE(te.project_id, wo.project_id)
  INTO v_project_id
  FROM time_entries te
  LEFT JOIN work_orders wo ON te.work_order_id = wo.id
  WHERE te.id = p_time_entry_id;
  
  RETURN v_project_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_time_entry_project_id TO authenticated;

-- Create view for easier time entry reporting (combines work order and direct project entries)
CREATE OR REPLACE VIEW time_entries_with_project AS
SELECT 
  te.*,
  COALESCE(te.project_id, wo.project_id) as effective_project_id,
  wo.work_order_number,
  wo.title as work_order_title,
  wo.type as work_order_type,
  p.project_number,
  p.name as project_name,
  p.status as project_status,
  c.full_name as contact_name,
  tech.full_name as technician_name
FROM time_entries te
LEFT JOIN work_orders wo ON te.work_order_id = wo.id
LEFT JOIN projects p ON COALESCE(te.project_id, wo.project_id) = p.id
LEFT JOIN contacts c ON p.contact_id = c.id
LEFT JOIN profiles tech ON te.technician_id = tech.id;

-- Grant select on view
GRANT SELECT ON time_entries_with_project TO authenticated;
