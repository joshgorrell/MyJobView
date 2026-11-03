/*\n  # Add Security Contracts Modules to Finance Department\n\n  ## Overview\n  Adds two new modules to the Finance department:\n  1. Security Contracts - For managing contracts internally\n  2. Security Onboarding - For sales staff to initiate new contracts\n\n  ## Changes\n  - Add "Security Contracts" module to Finance department\n  - Add "Security Onboarding" module to Finance department\n  - Set appropriate display order and permissions\n*/\n\n-- Get the finance department ID\nDO $$\nDECLARE\n  finance_dept_id uuid

\nBEGIN\n  SELECT id INTO finance_dept_id FROM departments WHERE name = 'finance'

\n\n  -- Add Security Contracts module to Finance department\n  INSERT INTO department_modules (\n    department_id,\n    module_key,\n    display_name,\n    description,\n    icon,\n    sort_order,\n    is_active\n  )\n  VALUES (\n    finance_dept_id,\n    'security_contracts',\n    'Security Contracts',\n    'Manage security alarm contracts and customer agreements',\n    'Shield',\n    60,\n    true\n  )\n  ON CONFLICT (department_id, module_key) DO UPDATE\n  SET \n    display_name = EXCLUDED.display_name,\n    description = EXCLUDED.description,\n    icon = EXCLUDED.icon,\n    sort_order = EXCLUDED.sort_order,\n    is_active = EXCLUDED.is_active

\n\n  -- Add Security Onboarding module to Finance department\n  INSERT INTO department_modules (\n    department_id,\n    module_key,\n    display_name,\n    description,\n    icon,\n    sort_order,\n    is_active\n  )\n  VALUES (\n    finance_dept_id,\n    'security_onboarding',\n    'Security Onboarding',\n    'Initiate new security contracts and pre-fill customer information',\n    'UserPlus',\n    61,\n    true\n  )\n  ON CONFLICT (department_id, module_key) DO UPDATE\n  SET \n    display_name = EXCLUDED.display_name,\n    description = EXCLUDED.description,\n    icon = EXCLUDED.icon,\n    sort_order = EXCLUDED.sort_order,\n    is_active = EXCLUDED.is_active

\nEND $$

\n
