/*
  # Consolidate Monitoring Service Categories

  1. Changes
    - Update all monitoring services to use a single "Monitoring" category
    - Removes separate categories like "Video Services", "Smart Home", "Add-ons"

  2. Purpose
    - Simplifies the monitoring services catalog to use one consistent category
    - All services are now under "Monitoring" for easier management
*/

-- Update all monitoring services to use "Monitoring" as the category
UPDATE monitoring_services
SET category = 'Monitoring'
WHERE category IN ('Video Services', 'Smart Home', 'Add-ons')
   OR category IS NULL;
