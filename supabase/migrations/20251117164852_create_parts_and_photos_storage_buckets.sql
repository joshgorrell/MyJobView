/*
  # Create Storage Buckets for Parts Requests and Job Photos

  1. Storage Buckets
    - `parts_request_photos` - Photos of parts/labels
    - `job_photos` - Before/during/after job documentation
    - `customer_signatures` - Customer signature images

  2. Security Policies
    - Techs can upload to their own requests/jobs
    - Admins can view/manage all
    - Customers can view their job photos
*/

-- Create parts_request_photos bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('parts_request_photos', 'parts_request_photos', false)
ON CONFLICT (id) DO NOTHING;

-- Create job_photos bucket  
INSERT INTO storage.buckets (id, name, public)
VALUES ('job_photos', 'job_photos', false)
ON CONFLICT (id) DO NOTHING;

-- Create customer_signatures bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer_signatures', 'customer_signatures', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for parts_request_photos
CREATE POLICY "Techs can upload parts request photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'parts_request_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Techs can view own parts request photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'parts_request_photos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'dispatch')
      )
    )
  );

CREATE POLICY "Techs can delete own parts request photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'parts_request_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for job_photos
CREATE POLICY "Techs can upload job photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'job_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Staff can view job photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'job_photos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'office_manager', 'dispatch', 'sales')
      )
    )
  );

CREATE POLICY "Techs can delete own job photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'job_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for customer_signatures
CREATE POLICY "Techs can upload customer signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'customer_signatures'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Staff can view customer signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'customer_signatures'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'dispatch', 'sales', 'technician')
    )
  );
