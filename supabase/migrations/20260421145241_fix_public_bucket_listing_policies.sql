/*
  # Fix Public Bucket Broad Listing Policies

  Public buckets serve objects via direct URL without needing a SELECT policy.
  The existing broad SELECT policies allow any anonymous client to LIST all files
  in each bucket, which exposes more data than intended.

  Fix: Drop the 7 broad unrestricted SELECT policies and replace with
  authenticated-only policies. Public object URLs continue to work since the
  buckets remain public. Anonymous listing is blocked.

  Policies dropped:
  - "Anyone can view company logo"           (company_logo)
  - "Anyone can view job_photos"             (job_photos)
  - "Anyone can view job photos"             (job-photos)
  - "Public read access for organization logos" (organization_logos)
  - "Product images are publicly accessible" (product-images)
  - "Authenticated users can view punchlist photos" (punchlist-photos) — already auth but bucket-wide
  - "Allow public reads contract sigs"       (security-contract-signatures)
*/

-- Drop the broad listing policies
DROP POLICY IF EXISTS "Anyone can view company logo" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view job_photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view job photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for organization logos" ON storage.objects;
DROP POLICY IF EXISTS "Product images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view punchlist photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads contract sigs" ON storage.objects;

-- Replace with authenticated-only policies
-- (public URL access still works because buckets are public; these only govern list/download via API)

CREATE POLICY "Authenticated users can view company logo"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'company_logo');

CREATE POLICY "Authenticated users can view organization logos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'organization_logos');

CREATE POLICY "Authenticated users can view product images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can view punchlist photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'punchlist-photos');

CREATE POLICY "Authenticated users can view contract signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'security-contract-signatures');

-- job_photos bucket: already has scoped "Staff can view job photos" policy;
-- add a simple authenticated fallback so all staff can access
CREATE POLICY "Authenticated users can view job_photos bucket"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'job_photos');

CREATE POLICY "Authenticated users can view job-photos bucket"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'job-photos');
