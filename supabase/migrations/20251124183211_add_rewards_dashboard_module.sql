/*
  # Add Rewards Dashboard Module

  1. Changes
    - Add "Rewards Dashboard" module to Pipeline department (alongside Team Pulse)
    - This is where users can view and redeem rewards
    - Admin manages points/rewards in Admin > Points & Rewards
  
  2. Module Features
    - View available rewards
    - Redeem rewards with earned points
    - View points transaction history
    - See top performers leaderboard
*/

-- Add Rewards Dashboard module to Pipeline department
INSERT INTO department_modules (department_id, module_key, display_name, icon, description, sort_order)
VALUES (
  (SELECT id FROM departments WHERE name = 'pipeline'),
  'rewards_dashboard',
  'Rewards',
  'Award',
  'Redeem points for rewards and view your transaction history',
  30
)
ON CONFLICT (department_id, module_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;
