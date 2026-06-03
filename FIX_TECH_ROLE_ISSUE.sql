-- Fix Tech Role Default Starred Modules Issue
-- Run this in your Supabase SQL Editor to fix the user creation error for Technicians

-- Add default starred modules for 'tech' role (same as technician)
INSERT INTO default_starred_modules (role, module_id, default_order)
SELECT 'tech', module_id, default_order
FROM default_starred_modules
WHERE role = 'technician'
ON CONFLICT (role, module_id) DO NOTHING;

-- Grant module access for 'tech' role (same as technician)
INSERT INTO module_role_access (module_id, role, has_access)
SELECT module_id, 'tech', has_access
FROM module_role_access
WHERE role = 'technician'
ON CONFLICT (module_id, role) DO UPDATE SET has_access = EXCLUDED.has_access;

-- Verify the fix
SELECT 'Tech role now has ' || COUNT(*) || ' default starred modules' AS result
FROM default_starred_modules
WHERE role = 'tech';
