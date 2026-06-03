/*
  # Create Contact Business Cards Storage Bucket

  1. New Storage Bucket
    - `contact-business-cards` bucket for storing business card photos
  
  2. Security
    - Authenticated users can upload their own photos
    - All authenticated users can view photos (for collaboration)
    - Users can update/delete their own uploads
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('contact-business-cards', 'contact-business-cards', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload contact business cards"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'contact-business-cards');

CREATE POLICY "Authenticated users can view contact business cards"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'contact-business-cards');

CREATE POLICY "Users can update their own contact business cards"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'contact-business-cards' AND auth.uid() = owner);

CREATE POLICY "Users can delete their own contact business cards"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'contact-business-cards' AND auth.uid() = owner);