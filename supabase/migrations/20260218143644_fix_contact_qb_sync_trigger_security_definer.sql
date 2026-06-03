/*
  # Fix contact QB sync trigger to use SECURITY DEFINER

  ## Problem
  The `trigger_contact_qb_sync` BEFORE trigger fires on every contact INSERT.
  It reads from `quickbooks_settings`, which has RLS policies that only allow
  `authenticated` users to SELECT. When an anonymous user (kiosk) tries to
  insert a contact, this trigger runs as the `anon` role, the SELECT on
  `quickbooks_settings` is blocked by RLS, and the entire contact INSERT fails
  with a misleading "row-level security policy" error on the `contacts` table.

  ## Fix
  Add SECURITY DEFINER to `trigger_contact_qb_sync` so it always runs with
  elevated privileges and can read `quickbooks_settings` regardless of the
  calling role.
*/

CREATE OR REPLACE FUNCTION public.trigger_contact_qb_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings record;
BEGIN
  -- Check if auto-sync is enabled
  SELECT auto_sync_enabled, access_token
  INTO v_settings
  FROM quickbooks_settings
  LIMIT 1;

  -- Only trigger if auto-sync is enabled and we have a valid token
  IF v_settings.auto_sync_enabled AND v_settings.access_token IS NOT NULL THEN
    -- Check if contact is ready for sync (has required data)
    IF is_contact_ready_for_qb_sync(NEW.id) THEN
      -- Set status to pending so edge function will pick it up
      NEW.qbo_sync_status := 'pending';
    ELSE
      -- Not enough data, skip QB sync
      NEW.qbo_sync_status := 'skipped';
      NEW.qbo_sync_error := 'Insufficient data for QuickBooks sync. Required: name and (email or phone)';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
