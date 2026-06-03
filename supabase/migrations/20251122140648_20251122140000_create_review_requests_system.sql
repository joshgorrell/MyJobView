/*
  # Create Review Requests System

  1. New Tables
    - `review_requests`
      - `id` (uuid, primary key)
      - `company_id` (uuid) - references auth.users for single-tenant
      - `contact_id` (uuid) - references contacts
      - `sent_by` (uuid) - references profiles (who sent the request)
      - `sent_at` (timestamptz) - when the request was sent
      - `method` (text) - how it was sent: 'email', 'sms', 'qr_code', 'manual'
      - `email_opened` (boolean) - if email was opened
      - `link_clicked` (boolean) - if review link was clicked
      - `clicked_at` (timestamptz) - when link was clicked
      - `review_completed` (boolean) - if we know they completed a review
      - `notes` (text) - optional notes
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `review_requests` table
    - Add policies for authenticated users to manage review requests

  3. Indexes
    - Index on contact_id for fast lookups
    - Index on sent_at for date filtering
    - Index on company_id for tenant filtering
*/

-- Create review_requests table
CREATE TABLE IF NOT EXISTS review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES auth.users(id),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sent_by uuid NOT NULL REFERENCES profiles(id),
  sent_at timestamptz DEFAULT now(),
  method text NOT NULL CHECK (method IN ('email', 'sms', 'qr_code', 'manual')),
  email_opened boolean DEFAULT false,
  link_clicked boolean DEFAULT false,
  clicked_at timestamptz,
  review_completed boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_review_requests_company ON review_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_contact ON review_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_sent_at ON review_requests(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_requests_sent_by ON review_requests(sent_by);

-- RLS Policies
CREATE POLICY "Users can view review requests in their company"
  ON review_requests FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert review requests in their company"
  ON review_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update review requests in their company"
  ON review_requests FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete review requests in their company"
  ON review_requests FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_review_requests_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_review_requests_updated_at ON review_requests;
CREATE TRIGGER update_review_requests_updated_at
  BEFORE UPDATE ON review_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_review_requests_updated_at();
