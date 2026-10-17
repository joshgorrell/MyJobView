/*\n  # Add Default Calendar View Preference to Profiles\n\n  ## Summary\n  Adds a `default_calendar_view` column to the `profiles` table so each user\n  can persist which calendar tab they want to land on by default.\n\n  ## Changes\n  ### Modified Tables\n  - `profiles`\n    - `default_calendar_view` (text, nullable): Stores the user's preferred calendar tab.\n      Can be `'my'` (My Calendar), `'technicians'` (All Technicians view), or a custom\n      calendar UUID string. Null means use the system default ('my').\n\n  ## Notes\n  - No RLS changes needed — profiles already have policies allowing users to update their own row.\n  - The column is nullable so existing users are unaffected until they actively choose a default.\n*/\n\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'profiles' AND column_name = 'default_calendar_view'\n  ) THEN\n    ALTER TABLE profiles ADD COLUMN default_calendar_view text DEFAULT NULL

\n  END IF

\nEND $$

\n
