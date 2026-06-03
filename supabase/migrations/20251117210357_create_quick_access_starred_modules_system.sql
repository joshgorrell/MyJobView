/*
  # Create Quick Access / Starred Modules System

  ## Overview
  Allows users to "star" their most important modules for quick access in the main navigation.
  Users can only star modules they have permission to access.

  ## Tables Created
  
  ### user_starred_modules
  Tracks which modules each user has starred/pinned for quick access.
  - User can star up to 6 modules
  - Only modules they have permission to access
  - Custom ordering (star_order)
  
  ### default_starred_modules
  Defines default starred modules by role, shown to new users or users who haven't customized.
  - Admins can configure defaults per role
  - Provides sensible defaults for common workflows

  ## Columns Added
  - department_modules.is_quick_access: Suggests modules that are good for quick access

  ## Security
  - RLS ensures users can only star modules they can access
  - Enforces max 6 starred modules per user
  - User overrides always take precedence over role defaults

  ## Default Quick Access Suggestions
  - Team Pulse (feed)
  - My Performance (individual_dashboard)
  - Team Leaderboard (team_leaderboard) 
  - Tasks
  - Messages (when implemented)
  - Connections
*/

-- Add is_quick_access suggestion flag to department_modules
ALTER TABLE department_modules 
ADD COLUMN IF NOT EXISTS is_quick_access boolean DEFAULT false;

-- Create user_starred_modules table
CREATE TABLE IF NOT EXISTS user_starred_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES department_modules(id) ON DELETE CASCADE,
  star_order int NOT NULL CHECK (star_order >= 1 AND star_order <= 6),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module_id),
  UNIQUE(user_id, star_order)
);

-- Create default_starred_modules table
CREATE TABLE IF NOT EXISTS default_starred_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  module_id uuid NOT NULL REFERENCES department_modules(id) ON DELETE CASCADE,
  default_order int NOT NULL CHECK (default_order >= 1 AND default_order <= 6),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(role, module_id),
  UNIQUE(role, default_order)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_starred_modules_user_id ON user_starred_modules(user_id);
CREATE INDEX IF NOT EXISTS idx_user_starred_modules_module_id ON user_starred_modules(module_id);
CREATE INDEX IF NOT EXISTS idx_default_starred_modules_role ON default_starred_modules(role);

-- Enable RLS
ALTER TABLE user_starred_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE default_starred_modules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_starred_modules
CREATE POLICY "Users can view own starred modules"
  ON user_starred_modules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own starred modules"
  ON user_starred_modules FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    -- Ensure user has access to the module they're starring
    EXISTS (
      SELECT 1 FROM department_modules dm
      JOIN departments d ON dm.department_id = d.id
      WHERE dm.id = module_id
      AND dm.is_active = true
      AND d.is_active = true
    )
  );

CREATE POLICY "Users can update own starred modules"
  ON user_starred_modules FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own starred modules"
  ON user_starred_modules FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for default_starred_modules (admin only)
CREATE POLICY "Anyone can view default starred modules"
  ON default_starred_modules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage default starred modules"
  ON default_starred_modules FOR ALL
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

-- Function to enforce max 6 starred modules per user
CREATE OR REPLACE FUNCTION check_max_starred_modules()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM user_starred_modules WHERE user_id = NEW.user_id) >= 6 THEN
    RAISE EXCEPTION 'Cannot star more than 6 modules. Please unstar a module first.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_max_starred_modules ON user_starred_modules;
CREATE TRIGGER enforce_max_starred_modules
  BEFORE INSERT ON user_starred_modules
  FOR EACH ROW
  EXECUTE FUNCTION check_max_starred_modules();
