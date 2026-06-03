/*
  # Add Bug Management Module to Admin Department

  1. Changes
    - Adds 'bug_management' module to the admin department
    - Sets display name, icon, and sort order
    - Module appears in admin navigation for managing bug reports

  2. Security
    - No RLS changes needed - inherits admin department access
*/

-- Add bug_management module to admin department
INSERT INTO department_modules (department_id, module_key, display_name, icon, sort_order)
SELECT 
  id,
  'bug_management',
  'Bug Reports',
  'Bug',
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM department_modules WHERE department_id = d.id)
FROM departments d
WHERE d.name = 'admin'
ON CONFLICT (department_id, module_key) DO NOTHING;