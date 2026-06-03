/*
  # Clean up Dispatch Module Navigation
  
  1. Changes
    - Remove crew_assignment module (redundant with main dispatch page)
    - Fix tech_work_center route to match app (tech_center)
    - Rename "Tech Status" to "All Techs Dashboard" for clarity
  
  2. Notes
    - Crew assignment functionality is now handled in main dispatch view
    - Route fix ensures navigation actually works
*/

-- Store the crew_assignment module ID before deleting
DO $$ 
DECLARE
  crew_assignment_id uuid;
BEGIN
  -- Get the crew_assignment module ID
  SELECT id INTO crew_assignment_id FROM department_modules WHERE module_key = 'crew_assignment';
  
  -- Delete starred references to this module
  IF crew_assignment_id IS NOT NULL THEN
    DELETE FROM user_starred_modules WHERE module_id = crew_assignment_id;
  END IF;
  
  -- Delete the crew_assignment module
  DELETE FROM department_modules WHERE module_key = 'crew_assignment';
END $$;

-- Fix the tech work center route to match the app
UPDATE department_modules 
SET module_key = 'tech_center'
WHERE module_key = 'tech_work_center';

-- Rename Tech Status for clarity
UPDATE department_modules 
SET 
  display_name = 'All Techs Dashboard',
  description = 'View all technician status, availability, and locations'
WHERE module_key = 'tech_status';
