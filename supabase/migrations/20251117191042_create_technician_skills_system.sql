/*
  # Technician Skills System

  1. New Tables
    - `skill_categories`
      - `id` (uuid, primary key)
      - `name` (text) - Category name (e.g., Audio, Video, Networking)
      - `description` (text, nullable)
      - `display_order` (integer)
      - `is_active` (boolean)
      - `created_at` (timestamptz)

    - `skills`
      - `id` (uuid, primary key)
      - `category_id` (uuid, references skill_categories)
      - `name` (text) - Skill name (e.g., Sonos Installation, Camera Programming)
      - `description` (text, nullable)
      - `display_order` (integer)
      - `is_active` (boolean)
      - `created_at` (timestamptz)

    - `technician_skills`
      - `id` (uuid, primary key)
      - `technician_id` (uuid, references profiles)
      - `skill_id` (uuid, references skills)
      - `proficiency_level` (text) - beginner, intermediate, expert
      - `certified` (boolean) - Has certification
      - `certification_date` (date, nullable)
      - `years_experience` (numeric, nullable)
      - `notes` (text, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - All authenticated users can view skills
    - Only admins can manage skill categories and skills
    - Techs and admins can update technician_skills
*/

-- Create skill_categories table
CREATE TABLE IF NOT EXISTS skill_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create skills table
CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES skill_categories(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(category_id, name)
);

-- Create technician_skills table
CREATE TABLE IF NOT EXISTS technician_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  skill_id uuid REFERENCES skills(id) ON DELETE CASCADE NOT NULL,
  proficiency_level text NOT NULL DEFAULT 'intermediate' CHECK (proficiency_level IN ('beginner', 'intermediate', 'expert')),
  certified boolean DEFAULT false,
  certification_date date,
  years_experience numeric(4, 1),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(technician_id, skill_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category_id, display_order);
CREATE INDEX IF NOT EXISTS idx_skills_active ON skills(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_technician_skills_tech ON technician_skills(technician_id);
CREATE INDEX IF NOT EXISTS idx_technician_skills_skill ON technician_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_technician_skills_proficiency ON technician_skills(proficiency_level);

-- Enable RLS
ALTER TABLE skill_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_skills ENABLE ROW LEVEL SECURITY;

-- RLS Policies for skill_categories
CREATE POLICY "Anyone can view skill categories"
  ON skill_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage skill categories"
  ON skill_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- RLS Policies for skills
CREATE POLICY "Anyone can view skills"
  ON skills FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage skills"
  ON skills FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- RLS Policies for technician_skills
CREATE POLICY "Anyone can view technician skills"
  ON technician_skills FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Techs can manage their own skills"
  ON technician_skills FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = technician_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Techs can update their own skills"
  ON technician_skills FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = technician_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can delete technician skills"
  ON technician_skills FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Seed skill categories
INSERT INTO skill_categories (name, description, display_order) VALUES
  ('Audio Systems', 'Audio equipment installation and configuration', 1),
  ('Video Systems', 'Video displays, projectors, and distribution', 2),
  ('Networking', 'Network infrastructure and connectivity', 3),
  ('Smart Home', 'Home automation and control systems', 4),
  ('Security', 'Security cameras and alarm systems', 5),
  ('Lighting Control', 'Lighting systems and automated controls', 6),
  ('Telecommunications', 'Phone and communication systems', 7),
  ('Programming', 'System programming and configuration', 8)
ON CONFLICT (name) DO NOTHING;

-- Seed common skills
INSERT INTO skills (category_id, name, description, display_order)
SELECT 
  c.id,
  skill.name,
  skill.description,
  skill.display_order
FROM skill_categories c
CROSS JOIN LATERAL (
  VALUES 
    -- Audio Systems
    ('Sonos Installation', 'Multi-room Sonos audio system setup', 1),
    ('Distributed Audio', 'Whole-home audio distribution', 2),
    ('Home Theater', 'Surround sound system installation', 3),
    ('Audio Calibration', 'Room acoustics and system tuning', 4)
) AS skill(name, description, display_order)
WHERE c.name = 'Audio Systems'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO skills (category_id, name, description, display_order)
SELECT 
  c.id,
  skill.name,
  skill.description,
  skill.display_order
FROM skill_categories c
CROSS JOIN LATERAL (
  VALUES 
    -- Video Systems
    ('TV Mounting', 'Wall mounting flat panel displays', 1),
    ('Video Distribution', 'HDMI and video signal distribution', 2),
    ('Projector Installation', 'Projector mounting and setup', 3),
    ('Display Calibration', 'Video calibration and color tuning', 4)
) AS skill(name, description, display_order)
WHERE c.name = 'Video Systems'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO skills (category_id, name, description, display_order)
SELECT 
  c.id,
  skill.name,
  skill.description,
  skill.display_order
FROM skill_categories c
CROSS JOIN LATERAL (
  VALUES 
    -- Networking
    ('Network Installation', 'Router and switch installation', 1),
    ('WiFi Design', 'Wireless network planning and optimization', 2),
    ('Network Troubleshooting', 'Network diagnostics and repair', 3),
    ('Structured Cabling', 'Cat6 and fiber optic cabling', 4)
) AS skill(name, description, display_order)
WHERE c.name = 'Networking'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO skills (category_id, name, description, display_order)
SELECT 
  c.id,
  skill.name,
  skill.description,
  skill.display_order
FROM skill_categories c
CROSS JOIN LATERAL (
  VALUES 
    -- Smart Home
    ('Control4 Programming', 'Control4 system programming', 1),
    ('Crestron Programming', 'Crestron system programming', 2),
    ('Lutron Integration', 'Lutron lighting integration', 3),
    ('Voice Control', 'Alexa and Google Home integration', 4)
) AS skill(name, description, display_order)
WHERE c.name = 'Smart Home'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO skills (category_id, name, description, display_order)
SELECT 
  c.id,
  skill.name,
  skill.description,
  skill.display_order
FROM skill_categories c
CROSS JOIN LATERAL (
  VALUES 
    -- Security
    ('Camera Installation', 'Security camera installation', 1),
    ('NVR Configuration', 'Network video recorder setup', 2),
    ('Access Control', 'Door locks and access systems', 3),
    ('Alarm Systems', 'Security alarm installation', 4)
) AS skill(name, description, display_order)
WHERE c.name = 'Security'
ON CONFLICT (category_id, name) DO NOTHING;

-- Create function to update technician_skills updated_at
CREATE OR REPLACE FUNCTION update_technician_skills_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_technician_skills_updated_at ON technician_skills;
CREATE TRIGGER trigger_update_technician_skills_updated_at
  BEFORE UPDATE ON technician_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_technician_skills_updated_at();

-- Add helpful comments
COMMENT ON TABLE skill_categories IS 'Categories of technical skills (Audio, Video, Networking, etc)';
COMMENT ON TABLE skills IS 'Specific technical skills within each category';
COMMENT ON TABLE technician_skills IS 'Skills possessed by each technician with proficiency levels';

COMMENT ON COLUMN technician_skills.proficiency_level IS 'Skill proficiency: beginner, intermediate, expert';
COMMENT ON COLUMN technician_skills.certified IS 'Whether technician has certification for this skill';
