/*
  # Create QuickBooks Integration Schema

  1. New Tables
    - `quickbooks_settings`
      - `id` (uuid, primary key)
      - `access_token` (text) - OAuth access token (encrypted)
      - `refresh_token` (text) - OAuth refresh token (encrypted)
      - `realm_id` (text) - QuickBooks company ID
      - `token_expires_at` (timestamptz) - When access token expires
      - `is_connected` (boolean) - Connection status
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on quickbooks_settings table
    - Only admins can view/modify QuickBooks settings
  
  3. Notes
    - Only one QuickBooks connection per company
    - Tokens are stored securely and refreshed automatically
    - Admin role required for all operations
*/

CREATE TABLE IF NOT EXISTS quickbooks_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text,
  refresh_token text,
  realm_id text,
  token_expires_at timestamptz,
  is_connected boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE quickbooks_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quickbooks_settings' AND policyname = 'Admins can view QuickBooks settings'
  ) THEN
    CREATE POLICY "Admins can view QuickBooks settings"
      ON quickbooks_settings FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quickbooks_settings' AND policyname = 'Admins can insert QuickBooks settings'
  ) THEN
    CREATE POLICY "Admins can insert QuickBooks settings"
      ON quickbooks_settings FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quickbooks_settings' AND policyname = 'Admins can update QuickBooks settings'
  ) THEN
    CREATE POLICY "Admins can update QuickBooks settings"
      ON quickbooks_settings FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quickbooks_settings' AND policyname = 'Admins can delete QuickBooks settings'
  ) THEN
    CREATE POLICY "Admins can delete QuickBooks settings"
      ON quickbooks_settings FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;
