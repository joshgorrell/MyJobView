/*
# Make security-contract-signatures bucket private

1. Problem
   - The storage bucket "security-contract-signatures" was public, so anyone with the
     object URL could view signed contract documents without authentication.

2. Changes
   - Sets public = false on the bucket.

3. Notes
   1. The bucket currently has zero objects and no code references, so no feature is
      affected.
*/

UPDATE storage.buckets SET public = false WHERE name = 'security-contract-signatures';