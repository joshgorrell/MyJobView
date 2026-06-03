/*
  # Add Google Calendar Integration

  ## Changes
  1. Add Google Calendar OAuth fields to profiles table:
    - `google_access_token` (text) - Encrypted Google OAuth access token
    - `google_refresh_token` (text) - Encrypted Google OAuth refresh token
    - `google_token_expires_at` (timestamptz) - When the access token expires
    - `google_calendar_connected` (boolean) - Whether calendar is connected (default: false)
    - `google_calendar_email` (text) - Google account email for reference

  ## Purpose
  - Store Google Calendar OAuth credentials per user
  - Enable automatic calendar event creation for reminders
  - Track connection status for each user
  
  ## Security
  - Tokens should be encrypted at rest
  - Only the user can access their own tokens via RLS
  - Tokens are used server-side in edge functions
*/

-- Add Google Calendar OAuth fields to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'google_access_token'
  ) THEN
    ALTER TABLE profiles ADD COLUMN google_access_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'google_refresh_token'
  ) THEN
    ALTER TABLE profiles ADD COLUMN google_refresh_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'google_token_expires_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN google_token_expires_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'google_calendar_connected'
  ) THEN
    ALTER TABLE profiles ADD COLUMN google_calendar_connected boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'google_calendar_email'
  ) THEN
    ALTER TABLE profiles ADD COLUMN google_calendar_email text;
  END IF;
END $$;