/*
  # Add AI Assistant Enabled Flag to Company Settings

  ## Summary
  Adds a boolean toggle `ai_assistant_enabled` to the `company_settings` table so
  that admins can turn the AI Assistant feature on or off company-wide from the
  Integrations Settings page.

  ## Changes
  - `company_settings` table: adds `ai_assistant_enabled` (boolean, default false)

  ## Notes
  - Defaults to false so existing organizations are not automatically opted in
  - The feature is only functional when both this flag is true AND an openai_api_key
    is configured
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'ai_assistant_enabled'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN ai_assistant_enabled boolean DEFAULT false;
  END IF;
END $$;
