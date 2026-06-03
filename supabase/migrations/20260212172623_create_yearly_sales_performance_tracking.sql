/*
  # Create Yearly Sales Performance Tracking System

  ## Summary
  Creates a system to track historical sales performance by year for sales team members,
  enabling year-over-year comparisons and historical trend analysis on the sales dashboard.

  ## New Tables
  - `yearly_sales_performance`
    - `id` (uuid, primary key) - Unique identifier
    - `user_id` (uuid, foreign key) - References profiles.id
    - `year` (integer) - Calendar year (e.g., 2022, 2023, 2024, 2025)
    - `total_revenue` (numeric) - Total sales revenue for the year (excluding sales tax)
    - `created_at` (timestamptz) - Record creation timestamp
    - `updated_at` (timestamptz) - Record last update timestamp

  ## Indexes
  - Unique constraint on (user_id, year) to prevent duplicate records
  - Index on user_id for fast user-specific lookups
  - Index on year for filtering by time period

  ## Security
  - Enable RLS on yearly_sales_performance table
  - Users can view their own historical performance records
  - Admin and Manager roles can view all historical performance records

  ## Seed Data
  Inserts historical sales data for three sales team members:
  - Aaron Koker: 2022-2025 performance data
  - Michael Colley: 2022-2025 performance data
  - Josh Gorrell: 2022-2025 performance data
*/

-- Create yearly_sales_performance table
CREATE TABLE IF NOT EXISTS yearly_sales_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year >= 2000 AND year <= 2100),
  total_revenue numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_revenue >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_user_year UNIQUE (user_id, year)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_yearly_sales_performance_user_id 
  ON yearly_sales_performance(user_id);

CREATE INDEX IF NOT EXISTS idx_yearly_sales_performance_year 
  ON yearly_sales_performance(year);

CREATE INDEX IF NOT EXISTS idx_yearly_sales_performance_user_year 
  ON yearly_sales_performance(user_id, year);

-- Enable Row Level Security
ALTER TABLE yearly_sales_performance ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own historical performance records
CREATE POLICY "Users can view own yearly sales performance"
  ON yearly_sales_performance
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
  );

-- Policy: Admin and Manager roles can view all historical performance records
CREATE POLICY "Admin and Managers can view all yearly sales performance"
  ON yearly_sales_performance
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Policy: Admin role can insert/update historical performance records
CREATE POLICY "Admin can manage yearly sales performance"
  ON yearly_sales_performance
  FOR ALL
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

-- Seed historical sales data for Aaron Koker
-- User ID: 67df38a9-8811-4504-bd00-6ed1a69b1ac4
INSERT INTO yearly_sales_performance (user_id, year, total_revenue, created_at, updated_at)
VALUES
  ('67df38a9-8811-4504-bd00-6ed1a69b1ac4', 2022, 843921.00, now(), now()),
  ('67df38a9-8811-4504-bd00-6ed1a69b1ac4', 2023, 1013120.00, now(), now()),
  ('67df38a9-8811-4504-bd00-6ed1a69b1ac4', 2024, 813213.00, now(), now()),
  ('67df38a9-8811-4504-bd00-6ed1a69b1ac4', 2025, 699416.00, now(), now())
ON CONFLICT (user_id, year) DO UPDATE
  SET total_revenue = EXCLUDED.total_revenue,
      updated_at = now();

-- Seed historical sales data for Michael Colley
-- User ID: ba6576f4-4b4d-4b29-bf60-6fd705bd9082
INSERT INTO yearly_sales_performance (user_id, year, total_revenue, created_at, updated_at)
VALUES
  ('ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2022, 684528.00, now(), now()),
  ('ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2023, 1023141.00, now(), now()),
  ('ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2024, 809819.00, now(), now()),
  ('ba6576f4-4b4d-4b29-bf60-6fd705bd9082', 2025, 1059304.00, now(), now())
ON CONFLICT (user_id, year) DO UPDATE
  SET total_revenue = EXCLUDED.total_revenue,
      updated_at = now();

-- Seed historical sales data for Josh Gorrell
-- User ID: b7a3a863-b230-4c54-a8d6-39b123a2924a
INSERT INTO yearly_sales_performance (user_id, year, total_revenue, created_at, updated_at)
VALUES
  ('b7a3a863-b230-4c54-a8d6-39b123a2924a', 2022, 148842.00, now(), now()),
  ('b7a3a863-b230-4c54-a8d6-39b123a2924a', 2023, 187345.00, now(), now()),
  ('b7a3a863-b230-4c54-a8d6-39b123a2924a', 2024, 226348.00, now(), now()),
  ('b7a3a863-b230-4c54-a8d6-39b123a2924a', 2025, 337581.00, now(), now())
ON CONFLICT (user_id, year) DO UPDATE
  SET total_revenue = EXCLUDED.total_revenue,
      updated_at = now();