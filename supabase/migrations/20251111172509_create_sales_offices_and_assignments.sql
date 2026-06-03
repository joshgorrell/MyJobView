/*
  # Create Sales Offices and User Assignments

  1. New Tables
    - `sales_offices`
      - `id` (uuid, primary key)
      - `name` (text) - Office name/city
      - `address` (text, nullable) - Office address
      - `phone` (text, nullable) - Office phone
      - `is_active` (boolean) - Whether office is active
      - `display_order` (integer) - Sort order for display
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `user_offices`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `office_id` (uuid, foreign key to sales_offices)
      - `created_at` (timestamptz)
      - Unique constraint on (user_id, office_id)

  2. Changes to Existing Tables
    - Add `office_id` to `leads` table

  3. Security
    - Enable RLS on both tables
    - Admins can manage offices and assignments
    - All authenticated users can view offices
    - Users can view their own office assignments

  4. Notes
    - If a user has no office assignments, they see all leads (backward compatible)
    - If a user is assigned to offices, they only see leads for those offices
*/

-- Create sales_offices table
CREATE TABLE IF NOT EXISTS sales_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_offices junction table
CREATE TABLE IF NOT EXISTS user_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  office_id uuid REFERENCES sales_offices(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, office_id)
);

-- Add office_id to leads table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'office_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN office_id uuid REFERENCES sales_offices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_leads_office_id ON leads(office_id);
CREATE INDEX IF NOT EXISTS idx_user_offices_user_id ON user_offices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_offices_office_id ON user_offices(office_id);

-- Enable RLS
ALTER TABLE sales_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_offices ENABLE ROW LEVEL SECURITY;

-- Sales Offices Policies
CREATE POLICY "Anyone can view active offices"
  ON sales_offices FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can view all offices"
  ON sales_offices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert offices"
  ON sales_offices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update offices"
  ON sales_offices FOR UPDATE
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

CREATE POLICY "Admins can delete offices"
  ON sales_offices FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- User Offices Policies
CREATE POLICY "Users can view their own office assignments"
  ON user_offices FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all office assignments"
  ON user_offices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert office assignments"
  ON user_offices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete office assignments"
  ON user_offices FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );