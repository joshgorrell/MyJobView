-- Create storage bucket for odometer photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('odometer-photos', 'odometer-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload odometer photos
CREATE POLICY "Users can upload their odometer photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'odometer-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to view their own odometer photos
CREATE POLICY "Users can view their odometer photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'odometer-photos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
      )
    )
  );

-- Allow users to delete their own odometer photos
CREATE POLICY "Users can delete their odometer photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'odometer-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );