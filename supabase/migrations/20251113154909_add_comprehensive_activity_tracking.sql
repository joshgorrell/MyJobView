/*
  # Add Comprehensive Activity Tracking

  1. Changes
    - Update feed_events table to support all activity types
    - Add columns for discussion_post_id and contact_id
    - Add new event types for discussions and contacts
    - Create database triggers to automatically track all activities
  
  2. New Event Types
    - 'discussion_created', 'discussion_replied', 'discussion_liked'
    - 'contact_created', 'contact_updated'
  
  3. Database Triggers
    - Auto-create feed events for discussion posts
    - Auto-create feed events for contacts
    - Auto-create feed events for tasks (if not already done in code)
  
  4. Notes
    - This provides complete visibility into all team activities
    - Triggers ensure events are never missed
    - Users can see real-time updates on what's happening
*/

-- Add new columns to feed_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feed_events' AND column_name = 'discussion_post_id'
  ) THEN
    ALTER TABLE feed_events ADD COLUMN discussion_post_id uuid REFERENCES discussion_posts(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feed_events' AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE feed_events ADD COLUMN contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update the event_type constraint to include all activity types
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
    'task_deleted',
    'discussion_created',
    'discussion_replied',
    'discussion_liked',
    'contact_created',
    'contact_updated'
  ));

-- Create indexes for new lookups
CREATE INDEX IF NOT EXISTS idx_feed_events_discussion_post_id ON feed_events(discussion_post_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_contact_id ON feed_events(contact_id);

-- Function to create discussion post event
CREATE OR REPLACE FUNCTION create_discussion_post_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create event for top-level posts (not replies)
  IF NEW.parent_id IS NULL THEN
    INSERT INTO feed_events (
      event_type,
      user_id,
      discussion_post_id,
      metadata
    ) VALUES (
      'discussion_created',
      NEW.user_id,
      NEW.id,
      jsonb_build_object(
        'post_type', NEW.post_type,
        'content_preview', substring(NEW.content, 1, 100)
      )
    );
  ELSE
    -- Create reply event
    INSERT INTO feed_events (
      event_type,
      user_id,
      discussion_post_id,
      metadata
    ) VALUES (
      'discussion_replied',
      NEW.user_id,
      NEW.parent_id,
      jsonb_build_object(
        'reply_id', NEW.id,
        'content_preview', substring(NEW.content, 1, 100)
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create contact event
CREATE OR REPLACE FUNCTION create_contact_event()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO feed_events (
      event_type,
      user_id,
      contact_id,
      metadata
    ) VALUES (
      'contact_created',
      NEW.created_by,
      NEW.id,
      jsonb_build_object(
        'name', NEW.name,
        'company', NEW.company
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only create update event if meaningful fields changed
    IF (OLD.name IS DISTINCT FROM NEW.name OR
        OLD.company IS DISTINCT FROM NEW.company OR
        OLD.email IS DISTINCT FROM NEW.email OR
        OLD.phone IS DISTINCT FROM NEW.phone OR
        OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
      INSERT INTO feed_events (
        event_type,
        user_id,
        contact_id,
        metadata
      ) VALUES (
        'contact_updated',
        auth.uid(),
        NEW.id,
        jsonb_build_object(
          'name', NEW.name,
          'company', NEW.company
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create task event (if not already tracked in code)
CREATE OR REPLACE FUNCTION create_task_event()
RETURNS TRIGGER AS $$
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
      NEW.created_by,
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
          'status', NEW.status
        )
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO feed_events (
      event_type,
      user_id,
      task_id,
      lead_id,
      metadata
    ) VALUES (
      'task_deleted',
      auth.uid(),
      OLD.id,
      OLD.lead_id,
      jsonb_build_object(
        'title', OLD.title
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
DROP TRIGGER IF EXISTS discussion_post_activity_trigger ON discussion_posts;
CREATE TRIGGER discussion_post_activity_trigger
  AFTER INSERT ON discussion_posts
  FOR EACH ROW
  EXECUTE FUNCTION create_discussion_post_event();

DROP TRIGGER IF EXISTS contact_activity_trigger ON contacts;
CREATE TRIGGER contact_activity_trigger
  AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION create_contact_event();

DROP TRIGGER IF EXISTS task_activity_trigger ON tasks;
CREATE TRIGGER task_activity_trigger
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION create_task_event();
