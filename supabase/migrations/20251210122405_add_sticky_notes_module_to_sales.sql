/*
  # Add Sticky Notes Module to Sales Department

  1. Changes
    - Add "Sticky Notes" module to Sales department navigation
    - Personal quick notes and reminders for sales team

  2. Notes
    - Module will appear in Sales department menu
    - Accessible to all roles with Sales department access
*/

-- Add Sticky Notes module to Sales department
INSERT INTO department_modules (
  department_id,
  module_key,
  display_name,
  description,
  icon,
  sort_order,
  is_active
)
SELECT
  id,
  'sticky-notes',
  'Sticky Notes',
  'Personal quick notes and reminders',
  'StickyNote',
  70,
  true
FROM departments
WHERE name = 'sales'
ON CONFLICT DO NOTHING;