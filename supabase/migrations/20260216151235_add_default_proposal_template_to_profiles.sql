/*
  # Add Default Proposal Report Template Preference

  1. Changes
    - Add `default_proposal_report_template_id` column to `profiles` table
    - Sales reps can set their preferred default template for proposals
    - This template will be auto-selected when they review proposals before sending

  2. Details
    - Column is nullable (users don't have to set a default)
    - Foreign key to `proposal_report_templates` table
    - Cascades to null if template is deleted
*/

-- Add default proposal report template preference to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'default_proposal_report_template_id'
  ) THEN
    ALTER TABLE profiles 
    ADD COLUMN default_proposal_report_template_id uuid REFERENCES proposal_report_templates(id) ON DELETE SET NULL;
    
    -- Add index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_profiles_default_template 
    ON profiles(default_proposal_report_template_id);
  END IF;
END $$;