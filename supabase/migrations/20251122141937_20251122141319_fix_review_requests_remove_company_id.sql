/*
  # Fix Review Requests Table - Remove Company ID

  1. Changes
    - Remove company_id column from review_requests table
    - Update RLS policies to work without company_id filtering
    - This is a single-tenant system, so company_id filtering is not needed

  2. Notes
    - Each database instance serves a single company
    - RLS only needs to verify authenticated users
*/

-- Drop company_id column and its foreign key constraint
ALTER TABLE review_requests 
  DROP CONSTRAINT IF EXISTS review_requests_company_id_fkey;

ALTER TABLE review_requests 
  DROP COLUMN IF EXISTS company_id CASCADE;

-- Drop and recreate RLS policies without company_id filtering
DROP POLICY IF EXISTS "Users can view review requests in their company" ON review_requests;
DROP POLICY IF EXISTS "Users can insert review requests in their company" ON review_requests;
DROP POLICY IF EXISTS "Users can update review requests in their company" ON review_requests;
DROP POLICY IF EXISTS "Users can delete review requests in their company" ON review_requests;

-- Simple RLS policies for single-tenant system
CREATE POLICY "Authenticated users can view review requests"
  ON review_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert review requests"
  ON review_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update review requests"
  ON review_requests FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete review requests"
  ON review_requests FOR DELETE
  TO authenticated
  USING (true);
