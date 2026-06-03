/*
  # Add Project Management Labor Phase

  Adds a "Project Management" labor phase to serve as the designated bucket
  for the 5% project management time allowance built into the labor goal
  calculation (GOAL_PCT = 0.95). Project managers log coordination,
  admin, and oversight time under this phase.

  Uses the company_id and organization_id from existing phases to match
  the tenant.

  1. Changes
    - Insert new labor_phases row: name = 'Project Management', sort_order = 6
*/

INSERT INTO labor_phases (name, sort_order, is_active, company_id, organization_id)
SELECT 'Project Management', 6, true, company_id, organization_id
FROM labor_phases
LIMIT 1
ON CONFLICT DO NOTHING;
