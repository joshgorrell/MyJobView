/*
  # Fix task event trigger to use user_id instead of created_by

  1. Problem
    - The `create_task_event` trigger function references `NEW.created_by`
    - But the `tasks` table uses `user_id` field, not `created_by`
    - This causes "record 'new' has no field 'created_by'" error on task creation

  2. Solution
    - Update the trigger function to use `NEW.user_id` instead of `NEW.created_by`
    
  3. Impact
    - Fixes task creation error
    - Feed events will now properly track task creation with the correct user_id
*/

-- Fix the create_task_event function to use user_id instead of created_by
CREATE OR REPLACE FUNCTION create_task_event()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO feed_events (
      event_type,
      user_id,
      task_id,
      lead_id,
      metadata
    ) VALUES (
      'task_created',
      NEW.user_id,  -- Fixed: was NEW.created_by
      NEW.id,
      NEW.lead_id,
      jsonb_build_object(
        'title', NEW.title,
        'status', NEW.status
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Track completion
    IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
      INSERT INTO feed_events (
        event_type,
        user_id,
        task_id,
        lead_id,
        metadata
      ) VALUES (
        'task_completed',
        auth.uid(),
        NEW.id,
        NEW.lead_id,
        jsonb_build_object(
          'title', NEW.title
        )
      );
    -- Track other updates
    ELSIF (OLD.title IS DISTINCT FROM NEW.title OR
           OLD.description IS DISTINCT FROM NEW.description OR
           OLD.due_date IS DISTINCT FROM NEW.due_date OR
           OLD.status IS DISTINCT FROM NEW.status) THEN
      INSERT INTO feed_events (
        event_type,
        user_id,
        task_id,
        lead_id,
        metadata
      ) VALUES (
        'task_updated',
        auth.uid(),
        NEW.id,
        NEW.lead_id,
        jsonb_build_object(
          'title', NEW.title,
          'old_status', OLD.status,
          'new_status', NEW.status
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;
