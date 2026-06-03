/*
  # Add Pipeline Widget Preferences

  1. Changes
    - Add `pipeline_widgets` column to `profiles` table to store user's selected widgets
    - Default to showing 4 widgets: contacts, connections, leads, fishbowl
    - Users can select up to 4 widgets from 5 available options

  2. Notes
    - Stored as JSONB array of widget identifiers
    - Maximum of 4 widgets can be selected
    - Default excludes "prospects" widget
*/

-- Add pipeline_widgets column to profiles with 4 default widgets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'pipeline_widgets'
  ) THEN
    ALTER TABLE profiles 
    ADD COLUMN pipeline_widgets jsonb DEFAULT '["contacts", "connections", "leads", "fishbowl"]'::jsonb;
  END IF;
END $$;

-- Add a check constraint to ensure max 4 widgets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'pipeline_widgets_max_4'
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT pipeline_widgets_max_4
    CHECK (jsonb_array_length(pipeline_widgets) <= 4);
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_pipeline_widgets ON profiles USING gin(pipeline_widgets);
