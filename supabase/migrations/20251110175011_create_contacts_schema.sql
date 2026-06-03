/*
  # Create Contacts Schema

  1. New Tables
    - `contacts`
      - `id` (uuid, primary key)
      - `company_name` (text) - Company/business name
      - `contact_name` (text, required) - Contact person name
      - `username` (text, unique, required) - Unique username for @mentions
      - `email` (text) - Email address
      - `phone` (text) - Phone number
      - `notes` (text) - General notes about the contact
      - `qbo_customer_id` (text) - QuickBooks customer ID
      - `created_by` (uuid) - User who created the contact
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on contacts table
    - Authenticated users can view all contacts
    - Authenticated users can create contacts
    - Users can update any contact
    - Only admins can delete contacts
  
  3. Indexes
    - Index on username for fast lookups
    - Index on qbo_customer_id for QuickBooks sync
    - Index on company_name for search
  
  4. Notes
    - Contacts are for storing customer information that may become leads later
    - Not assigned to reps or sent to fishbowl
    - Can be converted to leads when customer shows purchase interest
*/

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text,
  contact_name text NOT NULL,
  username text UNIQUE NOT NULL,
  email text,
  phone text,
  notes text,
  qbo_customer_id text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all contacts"
  ON contacts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create contacts"
  ON contacts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update contacts"
  ON contacts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Only admins can delete contacts"
  ON contacts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_contacts_username ON contacts(username);
CREATE INDEX IF NOT EXISTS idx_contacts_qbo_customer_id ON contacts(qbo_customer_id);
CREATE INDEX IF NOT EXISTS idx_contacts_company_name ON contacts(company_name);
CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by);

CREATE TABLE IF NOT EXISTS contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  tag text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contact tags"
  ON contact_tags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage contact tags"
  ON contact_tags FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_contact_tags_contact_id ON contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'converted_from_contact_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN converted_from_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_converted_from_contact ON leads(converted_from_contact_id);
