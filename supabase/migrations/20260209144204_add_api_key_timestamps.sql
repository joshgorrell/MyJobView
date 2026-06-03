/*
  # Add API Key Last Modified Timestamps

  1. Changes
    - Add timestamp columns to track when each API key was last modified
    - google_maps_api_key_updated_at - tracks Google Maps API key changes
    - twilio_auth_token_updated_at - tracks Twilio auth token changes
    - openai_api_key_updated_at - tracks OpenAI API key changes
    - zip_tax_api_key_updated_at - tracks ZipTax API key changes
  
  2. Purpose
    - Helps users identify when API keys were last changed
    - Prevents accidental overwrites by showing modification history
    - Provides audit trail for API key management
*/

DO $$
BEGIN
  -- Add timestamp columns for API key tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'google_maps_api_key_updated_at'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN google_maps_api_key_updated_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'twilio_auth_token_updated_at'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN twilio_auth_token_updated_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'openai_api_key_updated_at'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN openai_api_key_updated_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'zip_tax_api_key_updated_at'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN zip_tax_api_key_updated_at timestamptz;
  END IF;
END $$;