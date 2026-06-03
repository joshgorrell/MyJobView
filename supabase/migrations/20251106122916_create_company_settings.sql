/*
  # Create Company Settings

  1. New Tables
    - `company_settings`
      - `id` (uuid, primary key)
      - `company_name` (text) - Name of the company
      - `company_logo_url` (text) - URL to company logo
      - `website` (text) - Company website
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `company_offices`
      - `id` (uuid, primary key)
      - `office_name` (text) - e.g., "Main Office", "West Office", "East Office"
      - `phone` (text) - Office phone number
      - `address_line1` (text)
      - `address_line2` (text, nullable)
      - `city` (text)
      - `state` (text)
      - `zip` (text)
      - `display_order` (integer) - Order to display offices
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - All users can read company settings (needed for business cards)
    - Only admins can update company settings

  3. Initial Data
    - Create initial company_settings record
    - Create three placeholder office records
*/

CREATE TABLE IF NOT EXISTS company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'Evangeline LLC',
  company_logo_url text,
  website text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_name text NOT NULL,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_offices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view company settings"
  ON company_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can update company settings"
  ON company_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can insert company settings"
  ON company_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view company offices"
  ON company_offices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can insert company offices"
  ON company_offices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can update company offices"
  ON company_offices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete company offices"
  ON company_offices FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM company_settings LIMIT 1) THEN
    INSERT INTO company_settings (company_name, website)
    VALUES ('Evangeline LLC', 'https://www.evangelinellc.com');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM company_offices LIMIT 1) THEN
    INSERT INTO company_offices (office_name, phone, address_line1, city, state, zip, display_order)
    VALUES
      ('Main Office', '(555) 123-4567', '123 Main Street', 'Lafayette', 'LA', '70501', 1),
      ('North Office', '(555) 234-5678', '456 North Ave', 'Baton Rouge', 'LA', '70801', 2),
      ('South Office', '(555) 345-6789', '789 South Blvd', 'New Orleans', 'LA', '70112', 3);
  END IF;
END $$;
