/*
  # Fix Footer Navigation - Only Feature Suggestions

  ## Overview
  The footer should only show Feature Suggestions (accessible to all users).
  Company Settings and User Management should only be in the Admin dropdown.

  ## Solution
  Since we can't create a new department due to check constraints, we'll:
  - Keep Feature Suggestions in admin department but as the ONLY footer item (sort_order = 1)
  - Move everything else to higher sort_order numbers
  - Update the UI to only show modules with sort_order <= 1 in footer
*/

-- Feature Suggestions stays at sort order 1 for footer
UPDATE department_modules
SET sort_order = 1
WHERE module_key = 'feature_suggestions'
AND department_id IN (SELECT id FROM departments WHERE name = 'admin');

-- Company Settings - back to main admin (sort 4)
UPDATE department_modules
SET sort_order = 4
WHERE module_key = 'company_settings'
AND department_id IN (SELECT id FROM departments WHERE name = 'admin');

-- User Management - back to main admin (sort 5)
UPDATE department_modules
SET sort_order = 5
WHERE module_key = 'user_management'
AND department_id IN (SELECT id FROM departments WHERE name = 'admin');

-- Keep admin in footer navigation section since Feature Suggestions is there
UPDATE departments
SET navigation_section = 'footer'
WHERE name = 'admin';
