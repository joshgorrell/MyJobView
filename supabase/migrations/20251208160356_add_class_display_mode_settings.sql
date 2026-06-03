/*
  # Add Class Display Mode Settings

  1. Changes
    - Add `class_display_mode` to proposal_settings for controlling how classes appear in PDFs
      - 'inline' = show classes grouped within areas (default)
      - 'summary' = show classes on a separate summary page with totals
      - 'both' = show both inline and summary page
      - 'none' = don't show classes
    - Add `show_class_summary_page` boolean for quick toggle
    
  2. Purpose
    - Allows users to choose between inline class grouping or a separate class summary report
    - Class summary page shows just class name and total price per class
*/

-- Add class display mode setting
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'class_display_mode'
  ) THEN
    ALTER TABLE proposal_settings 
      ADD COLUMN class_display_mode text DEFAULT 'none' CHECK (class_display_mode IN ('inline', 'summary', 'both', 'none')),
      ADD COLUMN show_class_summary_page boolean DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN proposal_settings.class_display_mode IS 'How to display classes in PDF: inline (within areas), summary (separate page), both, or none';
COMMENT ON COLUMN proposal_settings.show_class_summary_page IS 'Whether to include a class summary page in the PDF report';