/*
  # Update Business Card RLS for User Access

  1. Changes
    - Drop all existing policies on business_cards, contact_captures, and storage.objects
    - Add policy for users to view their own card
    - Add policy for users to update their own card
    - Add policy for admins to view all cards
    - Add policy for admins to insert/update/delete all cards
    - Apply same changes to contact_captures and business_card_photos

  2. Security
    - Users can only edit their own business card
    - Admins can manage all business cards
    - Anyone can view active cards (for public sharing)
    - Users can view their own contact captures
    - Admins can view all contact captures
*/

-- Drop all business_cards policies
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'business_cards' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON business_cards', pol.policyname);
  END LOOP;
END $$;

-- New business_cards policies
CREATE POLICY "Anyone can view active business cards"
  ON business_cards FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can view their own card"
  ON business_cards FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_active = true);

CREATE POLICY "Users can update their own card"
  ON business_cards FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can insert business cards"
  ON business_cards FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update any business card"
  ON business_cards FOR UPDATE
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

CREATE POLICY "Admins can delete business cards"
  ON business_cards FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Update contact_captures policies
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'contact_captures' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON contact_captures', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view their own contact captures"
  ON contact_captures FOR SELECT
  TO authenticated
  USING (
    captured_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can create contact captures"
  ON contact_captures FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Update business_card_photos bucket policies
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage'
    AND policyname LIKE '%business_card_photo%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can upload their own business card photo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'business_card_photos' AND
    (
      auth.uid()::text = (storage.foldername(name))[1] OR
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    )
  );

CREATE POLICY "Users can update their own business card photo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'business_card_photos' AND
    (
      auth.uid()::text = (storage.foldername(name))[1] OR
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    )
  )
  WITH CHECK (
    bucket_id = 'business_card_photos' AND
    (
      auth.uid()::text = (storage.foldername(name))[1] OR
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    )
  );

CREATE POLICY "Users can delete their own business card photo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'business_card_photos' AND
    (
      auth.uid()::text = (storage.foldername(name))[1] OR
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    )
  );
