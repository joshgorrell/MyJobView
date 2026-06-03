/*
  # Reorganize Footer Navigation to be Minimal

  ## Overview
  The footer currently shows all 14 admin modules which is cluttered.
  This migration reorganizes the footer to show only essential admin links:
  - Company Settings
  - User Management  
  - Feature Suggestions

  All other admin modules remain accessible via the Admin department dropdown in main navigation.

  ## Changes
  - Move most admin modules' sort_order up (so they appear in Admin dropdown)
  - Keep only 3 essential links in footer with lower sort_order
*/

-- First, let's set up the footer items (low sort order = appears in footer)
-- Company Settings - most important
UPDATE department_modules 
SET sort_order = 1
WHERE module_key = 'company_settings'
AND department_id IN (SELECT id FROM departments WHERE name = 'admin');

-- User Management - second most important
UPDATE department_modules 
SET sort_order = 2
WHERE module_key = 'user_management'
AND department_id IN (SELECT id FROM departments WHERE name = 'admin');

-- Feature Suggestions - important for feedback
UPDATE department_modules 
SET sort_order = 3
WHERE module_key = 'feature_suggestions'
AND department_id IN (SELECT id FROM departments WHERE name = 'admin');

-- Move all other admin modules to higher sort order (main navigation)
UPDATE department_modules 
SET sort_order = 
  CASE module_key
    WHEN 'department_access' THEN 10
    WHEN 'role_permissions' THEN 11
    WHEN 'menu_builder' THEN 12
    WHEN 'products_catalog' THEN 20
    WHEN 'offices' THEN 21
    WHEN 'priority_management' THEN 30
    WHEN 'points_rewards' THEN 31
    WHEN 'email_templates' THEN 40
    WHEN 'travel_bonus_settings' THEN 41
    WHEN 'pay_types' THEN 42
    WHEN 'integrations' THEN 50
    ELSE sort_order
  END
WHERE department_id IN (SELECT id FROM departments WHERE name = 'admin')
AND module_key IN (
  'department_access',
  'role_permissions',
  'menu_builder',
  'products_catalog',
  'offices',
  'priority_management',
  'points_rewards',
  'email_templates',
  'travel_bonus_settings',
  'pay_types',
  'integrations'
);
