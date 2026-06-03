/*
  # Add Service Request Analytics Module to Dispatch Department

  ## Summary
  Registers a new "Service Request Analytics" module in the Dispatch department.
  This module provides response time KPI metrics for service request workflows:
  - Time from SR creation to work order scheduling
  - Time from WO creation to customer contact confirmation
  - Time from SR creation to work order completion

  ## Changes
  - Inserts new `service_request_analytics` module into `department_modules`
    under the Dispatch department (sort_order 12)
*/

INSERT INTO department_modules (
  department_id,
  module_key,
  display_name,
  description,
  icon,
  sort_order,
  is_active,
  organization_id
)
SELECT
  'b0f9c373-d91c-41a0-92b9-34288b8d2c1f',
  'service_request_analytics',
  'SR Response Analytics',
  'Service request response time metrics: time-to-schedule, customer contact, and completion',
  'BarChart2',
  12,
  true,
  'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'
WHERE NOT EXISTS (
  SELECT 1 FROM department_modules
  WHERE module_key = 'service_request_analytics'
    AND department_id = 'b0f9c373-d91c-41a0-92b9-34288b8d2c1f'
);
