/*
  # Add OpenAI API Key to Company Settings

  1. Changes
    - Add `openai_api_key` column to `company_settings` table for AI-powered scope of work generation
    - Keeps existing `gemini_api_key` for backward compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'openai_api_key'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN openai_api_key text;
  END IF;
END $$;
