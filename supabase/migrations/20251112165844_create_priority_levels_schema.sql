/*
  # Create Priority Levels Management System

  1. New Tables
    - `priority_levels`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references auth.users - admin user)
      - `name` (text, e.g., "Low", "Medium", "High", "Urgent")
      - `slug` (text, e.g., "low", "medium", "high", "urgent")
      - `color` (text, hex color code for UI display)
      - `sort_order` (integer, for ordering in dropdowns)
      - `is_active` (boolean, whether this priority is available for use)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Default Data
    - Seed with default priority levels (Low, Medium, High, Urgent)
    - These match the current hardcoded values

  3. Security
    - Enable RLS on priority_levels table
    - Admins can manage priority levels
    - All authenticated users can view active priorities
*/

-- Create priority_levels table
CREATE TABLE IF NOT EXISTS priority_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  color text NOT NULL DEFAULT '#6B7280',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, slug)
);

ALTER TABLE priority_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage priority levels"
  ON priority_levels FOR ALL
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

CREATE POLICY "Users can view active priority levels"
  ON priority_levels FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_priority_levels_company_id ON priority_levels(company_id);
CREATE INDEX IF NOT EXISTS idx_priority_levels_sort_order ON priority_levels(sort_order);

-- Insert default priority levels
-- Note: This will only insert if no priorities exist yet
DO $$
DECLARE
  admin_id uuid;
BEGIN
  -- Get the first admin user
  SELECT id INTO admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  
  -- Only insert defaults if we have an admin and no priorities exist
  IF admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM priority_levels LIMIT 1) THEN
    INSERT INTO priority_levels (company_id, name, slug, color, sort_order, is_active) VALUES
      (admin_id, 'Low', 'low', '#10B981', 1, true),
      (admin_id, 'Medium', 'medium', '#F59E0B', 2, true),
      (admin_id, 'High', 'high', '#EF4444', 3, true),
      (admin_id, 'Urgent', 'urgent', '#DC2626', 4, true);
  END IF;
END $$;