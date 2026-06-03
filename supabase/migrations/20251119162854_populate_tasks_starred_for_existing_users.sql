/*
  # Populate Tasks in Starred Modules for Existing Users

  ## Overview
  For users who don't have any custom starred modules yet, this migration adds 
  Tasks to their starred modules based on their role's default configuration.

  ## Changes
  - For each user without custom starred modules, populate from default_starred_modules
  - This ensures Tasks and other defaults appear immediately

  ## Security
  - Only populates for users who have no existing starred modules
  - Uses role-based defaults from default_starred_modules table
*/

DO $$
DECLARE
  user_rec RECORD;
  default_rec RECORD;
BEGIN
  -- For each user who has no starred modules yet
  FOR user_rec IN 
    SELECT p.id, p.role 
    FROM profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM user_starred_modules usm 
      WHERE usm.user_id = p.id
    )
  LOOP
    -- Insert their role's default starred modules
    FOR default_rec IN 
      SELECT module_id, default_order
      FROM default_starred_modules
      WHERE role = user_rec.role
      ORDER BY default_order
    LOOP
      INSERT INTO user_starred_modules (user_id, module_id, star_order)
      VALUES (user_rec.id, default_rec.module_id, default_rec.default_order)
      ON CONFLICT (user_id, module_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
