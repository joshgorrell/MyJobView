/*
  # Rename Design Queue to Design Brief, add title column, and improve draft RLS

  ## Changes

  ### 1. Rename navigation entry
  - Updates `department_modules` display name from "Design Queue" to "Design Brief"
  - Updates icon from "pen-tool" to "sparkles" to better match the feature

  ### 2. Add title column to design_briefs
  - Optional title field so sales reps can name their brief before AI processing
  - Defaults to empty string

  ### 3. Update RLS policies for creator editing
  - Currently creators can only edit their own DRAFT briefs
  - Update to allow creators to also edit SUBMITTED briefs (before design team starts)
  - This lets sales reps work on briefs over multiple days
  - Designers/admins/managers retain full edit access at all statuses

  ### 4. Add organization_id support
  - Add org_id column so briefs are properly scoped per organization
*/

-- Add title column to design_briefs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'design_briefs' AND column_name = 'title'
  ) THEN
    ALTER TABLE design_briefs ADD COLUMN title text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Add organization_id column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'design_briefs' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE design_briefs ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
    -- Backfill from profiles
    UPDATE design_briefs db
    SET organization_id = p.organization_id
    FROM profiles p
    WHERE p.id = db.created_by AND db.organization_id IS NULL;
  END IF;
END $$;

-- Add index on organization_id
CREATE INDEX IF NOT EXISTS idx_design_briefs_organization_id ON design_briefs(organization_id);

-- Rename "Design Queue" to "Design Brief" in navigation
UPDATE department_modules
SET
  display_name = 'Design Brief',
  icon = 'sparkles'
WHERE module_key = 'design_queue';

-- Drop existing creator-update policy and replace with one that allows editing draft AND submitted
DROP POLICY IF EXISTS "Users can update own draft briefs" ON design_briefs;

CREATE POLICY "Creators can update own non-completed briefs"
  ON design_briefs FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND status IN ('draft', 'submitted')
  )
  WITH CHECK (
    created_by = auth.uid()
    AND status IN ('draft', 'submitted')
  );

-- Update delete policy to allow deleting submitted (not yet worked on) briefs too
DROP POLICY IF EXISTS "Users can delete own draft briefs" ON design_briefs;

CREATE POLICY "Creators can delete own draft or submitted briefs"
  ON design_briefs FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND status IN ('draft', 'submitted')
  );
