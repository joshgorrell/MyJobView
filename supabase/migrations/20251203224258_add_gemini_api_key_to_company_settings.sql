/*
  # Add Gemini API Key to Company Settings

  1. Changes
    - Add `gemini_api_key` column to `company_settings` table for AI-powered scope of work generation
    - Encrypted storage alongside other API keys like Google Maps and Twilio
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'gemini_api_key'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN gemini_api_key text;
  END IF;
END $$;