/*
# Fix business card photo storage policies

1. Purpose
- Align storage access rules with the existing `business-card-photos` bucket used by the business card profile-photo upload.
- Remove the obsolete policy definitions that referenced the old `business_card_photos` bucket name.

2. Tables and columns
- No tables or columns are created or modified.
- Policies apply to `storage.objects` and use its `bucket_id` and object path.

3. Security
- Authenticated users may upload, update, and delete only objects whose first path segment is their own user ID.
- Authenticated users may read their own objects through the storage API.
- The bucket remains public for profile-photo display through its existing public URL behavior.

4. Notes
- Existing files and bucket settings are preserved.
- The policies are idempotent and safe to re-apply.
*/

DROP POLICY IF EXISTS "Users can upload their own business card photo" ON storage.objects;
CREATE POLICY "Users can upload their own business card photo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-card-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own business card photo" ON storage.objects;
CREATE POLICY "Users can update their own business card photo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-card-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'business-card-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own business card photo" ON storage.objects;
CREATE POLICY "Users can delete their own business card photo"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-card-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can read their own business card photo" ON storage.objects;
CREATE POLICY "Users can read their own business card photo"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'business-card-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);