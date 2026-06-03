/*
  # Add Commission Role User Types and Project Role Assignments

  ## Summary
  This migration extends the commission system to support:
  1. Org-level mapping of which user job roles are eligible for each commission type
  2. Per-project assignment of specific people to each commission role (Sales, Designer, PM)

  ## Changes

  ### 1. company_commission_settings
  - Adds `commission_role_user_types` (JSONB): maps each commission type key to an array of
    profile `job_role` values that are eligible for that commission type.
    Example: { "pm": ["project_manager", "manager"], "design": ["designer", "tech"] }

  ### 2. projects table
  - Adds `salesperson_id` (uuid, FK → profiles): the person earning sales commission on this job
  - Adds `designer_id` (uuid, FK → profiles): the person earning design commission on this job
  - The existing `project_manager_id` column already covers PM assignment

  ## Notes
  - JSONB default is an empty object so existing rows are valid immediately
  - New FK columns are nullable — no existing project data is affected
  - No RLS changes needed; these columns inherit existing table policies
*/

-- 1. Add commission role → user type mapping to company settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_commission_settings'
    AND column_name = 'commission_role_user_types'
  ) THEN
    ALTER TABLE company_commission_settings
      ADD COLUMN commission_role_user_types JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 2. Add salesperson_id to projects (for sales commission assignment per job)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects'
    AND column_name = 'salesperson_id'
  ) THEN
    ALTER TABLE projects
      ADD COLUMN salesperson_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Add designer_id to projects (for design commission assignment per job)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects'
    AND column_name = 'designer_id'
  ) THEN
    ALTER TABLE projects
      ADD COLUMN designer_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Add indexes for the new FK columns
CREATE INDEX IF NOT EXISTS idx_projects_salesperson_id ON projects(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_projects_designer_id ON projects(designer_id);
