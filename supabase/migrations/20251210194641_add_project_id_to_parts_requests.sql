/*
  # Add Project ID to Parts Requests

  1. Changes
    - Add project_id column to parts_requests table
    - Add foreign key constraint to projects table
    - Add index for project_id lookups
  
  2. Purpose
    - Allow parts requests to be associated with projects directly
    - Enables requesting parts for a project without a specific work order
*/

-- Add project_id column
ALTER TABLE parts_requests 
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_parts_requests_project_id ON parts_requests(project_id);

-- Add check constraint to ensure either work_order_id or project_id is provided for job requests
-- Note: This assumes there's a request_type column; if not, this constraint won't apply
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'parts_requests' 
    AND column_name = 'request_type'
  ) THEN
    -- Drop existing constraint if it exists
    ALTER TABLE parts_requests DROP CONSTRAINT IF EXISTS check_job_has_project_or_wo;
    
    -- Add new constraint
    ALTER TABLE parts_requests ADD CONSTRAINT check_job_has_project_or_wo
      CHECK (
        request_type != 'job' OR 
        (work_order_id IS NOT NULL OR project_id IS NOT NULL)
      );
  END IF;
END $$;