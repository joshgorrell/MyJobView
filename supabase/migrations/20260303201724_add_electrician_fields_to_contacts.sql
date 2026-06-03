/*
  # Add Electrician Fields to Contacts

  ## Summary
  Adds fields to track which electrician a prospect uses, providing valuable
  relationship intelligence alongside the existing competitor tracking system.

  ## Changes

  ### Modified Tables
  - `contacts`
    - `electrician_name` (text, nullable): Name of the electrician or electrical company the prospect uses
    - `electrician_notes` (text, nullable): Additional notes about the electrician relationship (e.g., scope of work, relationship strength)

  ## Notes
  - Both fields are nullable since this info is optional and only relevant for prospects
  - No separate table needed - electricians are informational context, not a tracked entity like competitors
  - RLS is inherited from the existing contacts table policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'electrician_name'
  ) THEN
    ALTER TABLE contacts ADD COLUMN electrician_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'electrician_notes'
  ) THEN
    ALTER TABLE contacts ADD COLUMN electrician_notes text;
  END IF;
END $$;
