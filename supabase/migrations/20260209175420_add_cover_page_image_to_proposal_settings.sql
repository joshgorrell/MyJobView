/*
  # Add Cover Page Image to Proposal Settings

  1. Changes to proposal_settings
    - `cover_page_image_url` (text, nullable) - URL to cover page image for PDF proposals
    - Allows selection from curated gallery or custom upload
    - Enhances professional appearance of proposal PDFs

  2. Purpose
    - Enable customizable cover page imagery for proposals
    - Support both stock images and custom uploads
    - Improve proposal aesthetics and professionalism
*/

-- Add cover_page_image_url column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'cover_page_image_url'
  ) THEN
    ALTER TABLE proposal_settings ADD COLUMN cover_page_image_url text;
  END IF;
END $$;