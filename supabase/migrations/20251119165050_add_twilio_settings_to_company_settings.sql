/*
  # Add Twilio SMS Integration Settings

  1. Changes
    - Add `twilio_account_sid` to company_settings for Twilio Account SID
    - Add `twilio_auth_token` to company_settings for Twilio Auth Token
    - Add `twilio_phone_number` to company_settings for Twilio phone number

  2. Security
    - Fields are optional (nullable) as not all companies will use Twilio
    - Sensitive tokens stored in database (should be encrypted at rest)
*/

-- Add Twilio SMS integration settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'twilio_account_sid'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN twilio_account_sid text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'twilio_auth_token'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN twilio_auth_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'twilio_phone_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN twilio_phone_number text;
  END IF;
END $$;
