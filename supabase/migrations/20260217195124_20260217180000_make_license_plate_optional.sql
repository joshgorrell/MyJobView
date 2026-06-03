/*
  # Make License Plate Optional

  1. Changes
    - Make license_plate column nullable in vehicles table
    - Allows vehicles to be created before receiving license plates
  
  2. Notes
    - Vehicles without plates will display "No plate" in the UI
    - Existing vehicles are not affected (plates remain)
*/

ALTER TABLE vehicles
ALTER COLUMN license_plate DROP NOT NULL;