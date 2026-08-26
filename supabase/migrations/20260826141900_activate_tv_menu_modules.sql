-- Activate and clearly label the two office TV dashboard modules.
-- Update by stable module_key values so this remains safe across environments.

UPDATE public.department_modules
SET
  is_active = true,
  display_name = CASE
    WHEN module_key = 'tv_dashboard' THEN 'Production TV'
    WHEN module_key = 'sales_tv_dashboard' THEN 'Sales TV'
    ELSE display_name
  END,
  updated_at = now()
WHERE module_key IN ('tv_dashboard', 'sales_tv_dashboard');
