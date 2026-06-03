/*
  # Add task notification type to notifications constraint

  1. Problem
    - The notifications table has a check constraint that only allows specific types
    - Current allowed types: lead_assigned, fishbowl_lead, escalated, mention, lead_claimed, lead_updated
    - Task notification triggers try to insert type = 'task' which is not in the constraint
    - This causes "violates check constraint notifications_type_check" error

  2. Solution
    - Drop the existing constraint
    - Add a new constraint that includes 'task' as a valid notification type
    
  3. Impact
    - Task notifications will now work properly
    - Users will receive notifications when tasks are created or updated
*/

-- Drop the existing constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add the updated constraint with 'task' type included
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'lead_assigned',
    'fishbowl_lead',
    'escalated',
    'mention',
    'lead_claimed',
    'lead_updated',
    'task',
    'task_assigned',
    'task_completed'
  ));
