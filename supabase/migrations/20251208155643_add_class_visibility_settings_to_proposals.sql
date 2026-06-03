/*
  # Add Class Visibility Settings to Proposals

  1. Changes
    - Add `show_classes_in_builder` to proposal_settings for on-screen class grouping
    - Add `show_classes_in_pdf` to proposal_settings for PDF class grouping
    - Add `group_by_class` to proposals table for per-proposal override
    - Users can toggle class visibility in builder and in PDF reports

  2. Defaults
    - Both default to false (disabled)
    - Can be enabled per proposal or as company default
*/

-- Add class visibility settings to proposal_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'show_classes_in_builder'
  ) THEN
    ALTER TABLE proposal_settings 
      ADD COLUMN show_classes_in_builder boolean DEFAULT false,
      ADD COLUMN show_classes_in_pdf boolean DEFAULT false;
  END IF;
END $$;

-- Add per-proposal class grouping override
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'show_classes_on_screen'
  ) THEN
    ALTER TABLE proposals 
      ADD COLUMN show_classes_on_screen boolean DEFAULT NULL,
      ADD COLUMN show_classes_in_report boolean DEFAULT NULL;
  END IF;
END $$;

COMMENT ON COLUMN proposals.show_classes_on_screen IS 'Override for showing classes in proposal builder. NULL uses company default from proposal_settings.';
COMMENT ON COLUMN proposals.show_classes_in_report IS 'Override for showing classes in PDF report. NULL uses company default from proposal_settings.';