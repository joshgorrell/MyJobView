/*
  # Add Personal Report Templates

  1. Changes
    - Add `is_personal` column to `proposal_report_templates` table
    - Personal templates are only visible to the creator
    - Company-wide templates (is_personal = false) are visible to all users in the company
    - All users can create personal templates
    - Only admins and sales managers can create company-wide templates

  2. Security
    - Update RLS policies to allow personal template creation
    - Users can view their own personal templates + all company-wide templates
    - Users can edit/delete only their own personal templates
    - Admins can manage all templates
*/

-- Add is_personal column to proposal_report_templates
ALTER TABLE proposal_report_templates
ADD COLUMN IF NOT EXISTS is_personal boolean DEFAULT false;

-- Create index for personal templates lookup
CREATE INDEX IF NOT EXISTS idx_proposal_report_templates_personal
  ON proposal_report_templates(created_by, is_personal)
  WHERE is_personal = true;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view templates from their company" ON proposal_report_templates;
DROP POLICY IF EXISTS "Admins and sales managers can create templates" ON proposal_report_templates;
DROP POLICY IF EXISTS "Admins and sales managers can update templates" ON proposal_report_templates;
DROP POLICY IF EXISTS "Admins can delete templates" ON proposal_report_templates;

-- New SELECT policy: Users can view company-wide templates OR their own personal templates
CREATE POLICY "Users can view company and personal templates"
  ON proposal_report_templates FOR SELECT
  TO authenticated
  USING (
    (
      -- Company-wide templates from their company
      NOT is_personal
      AND company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
    OR
    (
      -- Their own personal templates
      is_personal
      AND created_by = auth.uid()
    )
  );

-- New INSERT policy: Anyone can create personal templates, only admins/sales managers can create company-wide
CREATE POLICY "Users can create personal templates"
  ON proposal_report_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
    AND (
      -- Personal templates: anyone can create
      is_personal = true
      OR
      -- Company-wide templates: only admins and sales managers
      (
        is_personal = false
        AND EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid()
          AND role IN ('admin', 'sales_manager')
        )
      )
    )
  );

-- New UPDATE policy: Users can update their own personal templates, admins/managers can update company-wide
CREATE POLICY "Users can update own templates"
  ON proposal_report_templates FOR UPDATE
  TO authenticated
  USING (
    (
      -- Own personal templates
      is_personal = true
      AND created_by = auth.uid()
    )
    OR
    (
      -- Company-wide templates (admins and sales managers only)
      is_personal = false
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'sales_manager')
        AND company_id = proposal_report_templates.company_id
      )
    )
  );

-- New DELETE policy: Users can delete their own personal templates, admins can delete any
CREATE POLICY "Users can delete own templates"
  ON proposal_report_templates FOR DELETE
  TO authenticated
  USING (
    (
      -- Own personal templates
      is_personal = true
      AND created_by = auth.uid()
    )
    OR
    (
      -- Any template if admin
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
        AND company_id = proposal_report_templates.company_id
      )
    )
  );