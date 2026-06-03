/*
  # Drop broad SELECT policies on public storage buckets

  ## Summary
  Public buckets (company_logo, job_photos, job-photos, organization_logos,
  product-images, punchlist-photos, security-contract-signatures) have broad
  SELECT policies that allow any authenticated user to list ALL files in the
  bucket. Since these are public buckets, direct URL access works without any
  policy, but listing policies allow enumeration of all stored file paths.

  ## Changes
  - Drop "Authenticated users can view company logo" SELECT policy
  - Drop "Authenticated users can view job-photos bucket" SELECT policy
  - Drop "Authenticated users can view job_photos bucket" SELECT policy
  - Drop "Authenticated users can view organization logos" SELECT policy
  - Drop "Authenticated users can view product images" SELECT policy
  - Drop "Authenticated users can view punchlist photos" SELECT policy
  - Drop "Authenticated users can view contract signatures" SELECT policy
  - Drop "Authenticated users can view contact business cards" SELECT policy

  ## Security Impact
  Removes the ability for authenticated users to enumerate/list all files
  in these buckets. Public URL access to known file paths is unaffected
  since the buckets are public.
*/

DROP POLICY IF EXISTS "Authenticated users can view company logo" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view job-photos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view job_photos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view organization logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view punchlist photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view contract signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view contact business cards" ON storage.objects;
