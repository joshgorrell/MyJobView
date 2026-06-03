/*
  # Fix contact event trigger to skip anonymous inserts

  ## Problem
  The `create_contact_event` trigger fires on every contact INSERT and tries to insert
  into `feed_events`. However `feed_events.organization_id` is NOT NULL, and the trigger
  does not supply an organization_id. For anonymous (kiosk) inserts where `created_by`
  is NULL, this causes the entire contact INSERT to fail — surfacing as an RLS error.

  ## Fix
  Skip the feed event entirely when `NEW.created_by IS NULL` (anonymous/kiosk contacts).
  The existing `award_points_for_contact` trigger already has this guard.
*/

CREATE OR REPLACE FUNCTION public.create_contact_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Skip feed event for anonymous / kiosk inserts (no authenticated user)
    IF NEW.created_by IS NULL THEN
      RETURN NEW;
    END IF;

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
        'name', NEW.contact_name,
        'company', NEW.company_name
      )
    );

  ELSIF TG_OP = 'UPDATE' THEN
    -- Only create update event if meaningful fields changed and user is authenticated
    IF auth.uid() IS NOT NULL AND (
        OLD.contact_name IS DISTINCT FROM NEW.contact_name OR
        OLD.company_name IS DISTINCT FROM NEW.company_name OR
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
          'name', NEW.contact_name,
          'company', NEW.company_name
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
