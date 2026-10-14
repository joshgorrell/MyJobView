/*\n  # Add integration columns to organizations table\n\n  1. New Columns on `organizations`\n    - `twilio_account_sid` (text) - Twilio account SID for SMS\n    - `twilio_auth_token` (text) - Twilio auth token\n    - `twilio_phone_number` (text) - Twilio sender phone number\n    - `google_maps_api_key` (text) - Google Maps API key\n    - `openai_api_key` (text) - OpenAI API key\n    - `gemini_api_key` (text) - Gemini API key\n    - `zip_tax_api_key` (text) - ZipTax API key for tax lookups\n\n  2. New Column on `quickbooks_settings`\n    - `oauth_state` (text) - Temporary OAuth state for CSRF protection\n\n  3. Data Migration\n    - Copies existing values from company_settings to the first organization\n\n  4. Notes\n    - These columns previously lived in company_settings (singleton table)\n    - Moving to organizations enables per-org integration configuration\n*/\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'organizations' AND column_name = 'twilio_account_sid'\n  ) THEN\n    ALTER TABLE organizations ADD COLUMN twilio_account_sid text

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'organizations' AND column_name = 'twilio_auth_token'\n  ) THEN\n    ALTER TABLE organizations ADD COLUMN twilio_auth_token text

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'organizations' AND column_name = 'twilio_phone_number'\n  ) THEN\n    ALTER TABLE organizations ADD COLUMN twilio_phone_number text

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'organizations' AND column_name = 'google_maps_api_key'\n  ) THEN\n    ALTER TABLE organizations ADD COLUMN google_maps_api_key text

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'organizations' AND column_name = 'openai_api_key'\n  ) THEN\n    ALTER TABLE organizations ADD COLUMN openai_api_key text

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'organizations' AND column_name = 'gemini_api_key'\n  ) THEN\n    ALTER TABLE organizations ADD COLUMN gemini_api_key text

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'organizations' AND column_name = 'zip_tax_api_key'\n  ) THEN\n    ALTER TABLE organizations ADD COLUMN zip_tax_api_key text

\n  END IF

\n\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'quickbooks_settings' AND column_name = 'oauth_state'\n  ) THEN\n    ALTER TABLE quickbooks_settings ADD COLUMN oauth_state text

\n  END IF

\nEND $$

\n\nUPDATE organizations o\nSET\n  twilio_account_sid = cs.twilio_account_sid,\n  twilio_auth_token = cs.twilio_auth_token,\n  twilio_phone_number = cs.twilio_phone_number,\n  google_maps_api_key = cs.google_maps_api_key,\n  openai_api_key = cs.openai_api_key,\n  gemini_api_key = cs.gemini_api_key,\n  zip_tax_api_key = cs.zip_tax_api_key\nFROM (SELECT * FROM company_settings LIMIT 1) cs\nWHERE o.twilio_account_sid IS NULL\n  AND EXISTS (SELECT 1 FROM company_settings)

\n
