/*
  # Remove Schedule Board and Enhance Calendar System
  
  1. Changes
    - Remove the Schedule Board module from Dispatch department (redundant with Calendar + Work Orders)
    - Calendar will be the single source for scheduling visualization
    
  2. Notes
    - Schedule Board functionality is replaced by enhanced Calendar with filtering
    - Users can filter by technician, view modes, and customize their calendar view
*/

-- Remove Schedule Board module and any user stars for it
DELETE FROM user_starred_modules 
WHERE module_id IN (
  SELECT dm.id 
  FROM department_modules dm
  JOIN departments d ON d.id = dm.department_id
  WHERE d.name = 'dispatch' AND dm.module_key = 'schedule_board'
);

DELETE FROM department_modules 
WHERE id IN (
  SELECT dm.id 
  FROM department_modules dm
  JOIN departments d ON d.id = dm.department_id
  WHERE d.name = 'dispatch' AND dm.module_key = 'schedule_board'
);
