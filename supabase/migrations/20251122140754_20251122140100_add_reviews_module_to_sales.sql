/*
  # Add Reviews Module to Sales Department

  1. Changes
    - Add 'reviews' module to the Sales department
    - Module key: 'reviews'
    - Display name: 'Reviews'
    - Icon: 'Star'
    - Sort order: 60 (after other sales modules)

  2. Notes
    - This allows users to manage Google review requests
    - Includes QR code generation and email tracking
*/

-- Insert the reviews module into the Sales department
INSERT INTO department_modules (department_id, module_key, display_name, description, icon, sort_order, is_active)
SELECT 
  id,
  'reviews',
  'Reviews',
  'Request and track Google reviews from customers',
  'Star',
  60,
  true
FROM departments
WHERE name = 'sales'
ON CONFLICT (department_id, module_key) DO NOTHING;
