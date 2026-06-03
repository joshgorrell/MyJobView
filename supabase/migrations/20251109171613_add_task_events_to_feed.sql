/*
  # Add Task Events to Activity Feed

  1. Changes
    - Update `feed_events` table to support task-related event types
    - Add new event types: 'task_created', 'task_completed', 'task_updated', 'task_deleted'
    - Add optional `task_id` column to link events to tasks
  
  2. New Index
    - Add index on `task_id` for efficient task event queries
  
  3. Notes
    - Task events will appear in the Activity feed alongside lead events
    - Users can see when team members create, complete, update, or delete tasks
    - This provides better visibility into team workload and task management
*/

-- Add task_id column to feed_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feed_events' AND column_name = 'task_id'
  ) THEN
    ALTER TABLE feed_events ADD COLUMN task_id uuid REFERENCES tasks(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update the event_type constraint to include task events
ALTER TABLE feed_events DROP CONSTRAINT IF EXISTS feed_events_event_type_check;

ALTER TABLE feed_events ADD CONSTRAINT feed_events_event_type_check
  CHECK (event_type IN (
    'lead_created', 
    'lead_assigned', 
    'lead_claimed', 
    'message_posted', 
    'lead_escalated', 
    'lead_updated', 
    'lead_closed',
    'task_created',
    'task_completed',
    'task_updated',
    'task_deleted'
  ));

-- Create index for task event lookups
CREATE INDEX IF NOT EXISTS idx_feed_events_task_id ON feed_events(task_id);