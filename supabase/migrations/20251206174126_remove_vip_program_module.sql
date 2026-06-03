/*
  # Remove VIP Program Module

  Removes the VIP Program (90-day follow-up tracking) from the Production department.
  
  **Note:** This does NOT affect VIP Plans (recurring membership billing) in the Finance department.
  
  Changes:
  - Deletes 'vip_program' module from department_modules
  - Removes user starred module entries for vip_program
*/

-- Remove from user starred modules
DELETE FROM user_starred_modules
WHERE module_id = (
  SELECT id FROM department_modules 
  WHERE module_key = 'vip_program'
);

-- Remove the module
DELETE FROM department_modules
WHERE module_key = 'vip_program';
