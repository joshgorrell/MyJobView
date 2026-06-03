/*
  # Add Portal URL to Company Settings

  1. Changes
    - Add portal_url field to company_settings for frontend app URL configuration
    - This URL is used in customer-facing communications (emails, SMS)
    - Example: https://yourcompany.com or https://app.yourcompany.com

  2. Purpose
    - Allow admins to configure the correct frontend URL for portal links
    - Ensures deposit reminder emails link to the correct portal location
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'portal_url'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN portal_url text;
  END IF;
END $$;

COMMENT ON COLUMN company_settings.portal_url IS 'Frontend application URL for customer portal links (e.g., https://app.yourcompany.com)';
