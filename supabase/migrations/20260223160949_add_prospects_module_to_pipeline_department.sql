
/*
  # Add Prospects module to Pipeline department

  - Removes any existing prospects module (cleanup)
  - Shifts Leads (sort_order 2) and all modules below it up by 1 in Pipeline
  - Inserts Prospects at sort_order 2 in Pipeline, just above Leads (now sort_order 3)
*/

DELETE FROM department_modules
WHERE module_key = 'prospects';

UPDATE department_modules
SET sort_order = sort_order + 1
WHERE department_id = (SELECT id FROM departments WHERE name = 'pipeline')
  AND sort_order >= 2;

INSERT INTO department_modules (department_id, organization_id, module_key, display_name, icon, sort_order, is_active)
SELECT
  d.id,
  d.organization_id,
  'prospects',
  'Prospects',
  'Target',
  2,
  true
FROM departments d
WHERE d.name = 'pipeline';
