/*
  # Remove Crew Tools Module and Rename Appointments to Calendar

  ## Changes Made
  1. Delete the crew_tools module (Crew Assignment) as it's not needed
  2. Rename appointments module to calendar
  3. Update calendar module to indicate it shows scheduled work orders

  ## Notes
  - The crew_assignments table remains in the database for potential future use
  - Calendar will show both appointments and scheduled work orders
  - User starred modules are not affected since we're updating the same module row
*/

-- Delete the crew_tools module (Crew Assignment)
DELETE FROM department_modules 
WHERE module_key = 'crew_tools';

-- Rename appointments module to calendar and update description
UPDATE department_modules 
SET 
  module_key = 'calendar',
  display_name = 'Calendar',
  description = 'View all appointments and scheduled work orders'
WHERE module_key = 'appointments';