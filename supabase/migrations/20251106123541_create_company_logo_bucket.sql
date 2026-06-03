/*
  # Create Company Logo Storage Bucket

  1. New Bucket
    - `company_logo` - For storing company logo images
    - Public access for display on business cards
    - Only admins can upload/delete

  2. Security
    - Public bucket (files are publicly accessible)
    - RLS policies to restrict upload/delete to admins only
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('company_logo', 'company_logo', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view company logo"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company_logo');

CREATE POLICY "Only admins can upload company logo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company_logo' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can update company logo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company_logo' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'company_logo' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete company logo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company_logo' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
