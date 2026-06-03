/*
  # Update Daily Clock Module to Time Clock History

  1. Changes
    - Rename "Daily Clock" to "Time Clock History" in dispatch department
    - Update description to reflect comprehensive history and reporting features
  
  2. Purpose
    - The Time Clock History module now shows:
      - All clock in/out entries with filtering
      - Search by technician
      - Date range filtering
      - Late arrival tracking
      - Break history
      - Admin adjustments
*/

-- Update the daily_clock module in dispatch department
UPDATE department_modules
SET 
  display_name = 'Time Clock History',
  description = 'Comprehensive time clock history with filtering, search, and late arrival tracking'
WHERE module_key = 'daily_clock'
  AND department_id = (SELECT id FROM departments WHERE name = 'dispatch');
