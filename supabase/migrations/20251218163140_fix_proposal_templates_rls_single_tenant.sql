/*
  # Fix Proposal Report Templates RLS for Single-Tenant System

  1. Changes
    - Fix RLS policies that incorrectly reference profiles.company_id
    - This is a single-tenant system - profiles table does NOT have company_id
    - Use company_settings table to get the single company_id
    - Policies now properly work with the single-tenant architecture

  2. Security
    - All authenticated users can view company-wide templates
    - All authenticated users can create personal templates
    - Users can only edit/delete their own personal templates
    - Only admins and sales managers can manage company-wide templates
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view company and personal templates" ON proposal_report_templates;
DROP POLICY IF EXISTS "Users can create personal templates" ON proposal_report_templates;
DROP POLICY IF EXISTS "Users can update own templates" ON proposal_report_templates;
DROP POLICY IF EXISTS "Users can delete own templates" ON proposal_report_templates;

-- New SELECT policy: Users can view company-wide templates OR their own personal templates
CREATE POLICY "Users can view company and personal templates"
  ON proposal_report_templates FOR SELECT
  TO authenticated
  USING (
    (
      -- Company-wide templates
      NOT is_personal
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
    created_by = auth.uid()
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
      )
    )
  );