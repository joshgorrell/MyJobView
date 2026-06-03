/*
  # Allow Anonymous Access to Google Maps API Key

  1. Changes
    - Add policy to allow anonymous users to read company_settings
    - This is needed for the address autocomplete on the public signup page
    - Google Maps API keys are safe to expose as they can be domain-restricted

  2. Security
    - Google Maps API keys should be restricted by domain in Google Cloud Console
    - Only allow SELECT, not INSERT/UPDATE/DELETE
*/

-- Allow anonymous users to read company settings (needed for Google Maps API key)
CREATE POLICY "Anonymous users can view company settings"
  ON company_settings FOR SELECT
  TO anon
  USING (true);
