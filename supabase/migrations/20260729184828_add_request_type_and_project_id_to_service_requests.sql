/*
# Add request_type and project_id to service_requests

1. Purpose
   Rename "New Service Request" to "Work Order Request" and support project-type
   requests that link to an existing project. This migration adds two columns
   to the service_requests table:

   - request_type: 'service' (default, existing behavior) or 'project'
   - project_id: nullable FK to projects(id) for project-type requests

2. Schema Changes
   - service_requests.request_type text NOT NULL DEFAULT 'service'
     CHECK (request_type IN ('service', 'project'))
   - service_requests.project_id uuid REFERENCES projects(id) ON DELETE SET NULL
   - Index on project_id for efficient lookups

3. Security
   - No new RLS policies needed — the existing service_requests SELECT policy
     already allows authenticated users to see requests they created or that
     are billable to them, plus admins/dispatch/production_manager/sales_manager.
     Project-type requests follow the same access pattern.
   - The existing INSERT policy (auth.uid() = created_by) covers project-type
     requests since they are still created by the authenticated user.
   - The existing UPDATE policy covers project-type requests the same way.

4. Backward Compatibility
   - request_type defaults to 'service' so all existing rows are valid.
   - project_id is nullable so existing rows are unaffected.
*/

-- Add request_type column
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'service'
  CHECK (request_type IN ('service', 'project'));

-- Add project_id column
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

-- Add index on project_id
CREATE INDEX IF NOT EXISTS idx_service_requests_project ON service_requests(project_id);