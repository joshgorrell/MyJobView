/*
  # Add Google Maps API Key to Company Settings
  
  1. Changes
    - Add google_maps_api_key column to company_settings table
    - This will be used for Google Places address autocomplete
    
  2. Security
    - Only admins can view and update this sensitive API key
*/

-- Add Google Maps API key field
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' 
    AND column_name = 'google_maps_api_key'
  ) THEN
    ALTER TABLE company_settings 
    ADD COLUMN google_maps_api_key text;
  END IF;
END $$;
