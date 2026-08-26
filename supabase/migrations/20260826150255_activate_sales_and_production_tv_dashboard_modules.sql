/*
# Activate Sales and Production TV Dashboard navigation modules

Makes the existing TV Dashboard entries visible in their respective department menus.
Access remains controlled by the existing role_module_access records.
*/
UPDATE department_modules
SET is_active = true, updated_at = now()
WHERE module_key IN ('tv_dashboard', 'sales_tv_dashboard');
