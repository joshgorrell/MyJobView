/*
# Push notification infrastructure + work order change notifications

## Purpose
1. Create `push_tokens` table to store Expo push notification tokens per user/device.
2. Add a database trigger on `work_orders` that creates in-app notifications when
   a work order's scheduled date, description, title, address, or status changes
   (the assigned technician is notified via the existing `notifications` table).
3. Add a trigger on `notifications` that calls the `send_push_notification` edge
   function via `pg_notify` so a background worker can deliver push notifications
   to mobile devices.

## New Tables
- `push_tokens`
  - `id` (uuid, PK)
  - `user_id` (uuid, FK to auth.users, NOT NULL) — which user this token belongs to
  - `token` (text, NOT NULL) — the Expo push token
  - `device_platform` (text) — 'ios' or 'android'
  - `device_model` (text) — device model name for identification
  - `is_active` (boolean, default true) — soft-disable stale tokens
  - `notifications_enabled` (boolean, default true) — user preference from Settings
  - `organization_id` (uuid, FK to organizations) — multi-tenant scoping
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

## Modified Tables
- None modified. Existing `notifications` table is used as-is.

## Security
- `push_tokens` has RLS enabled. Each authenticated user can only manage their own tokens.
- The work order change trigger is SECURITY DEFINER so it can insert into `notifications`
  regardless of which role made the update.

## Important Notes
1. The `notify_work_order_change` trigger fires AFTER UPDATE on `work_orders` when
   any of: `scheduled_date`, `description`, `title`, `address`, `status`, `priority`,
   `service_location_address` changes. It only creates a notification if the work
   order has an assigned technician (`assigned_to` is not null) and the technician
   is different from the user making the change (so admins editing their own
   assignments don't self-notify).
2. The `notify_push_dispatch` trigger on `notifications` sends a PostgreSQL NOTIFY
   event so a background process (edge function cron) can pick up unread notifications
   and send push messages via the Expo Push API.
3. Push token registration is idempotent — inserting a token for the same user
   updates the existing row if the token already exists (via unique constraint on token).
*/

-- ============================================================
-- 1. push_tokens table
-- ============================================================

CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  device_platform text,
  device_model text,
  is_active boolean NOT NULL DEFAULT true,
  notifications_enabled boolean NOT NULL DEFAULT true,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per unique token (a physical device can only have one active token)
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_key ON push_tokens (token);

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON push_tokens (user_id) WHERE is_active = true;

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_push_tokens" ON push_tokens;
CREATE POLICY "select_own_push_tokens" ON push_tokens FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_push_tokens" ON push_tokens;
CREATE POLICY "insert_own_push_tokens" ON push_tokens FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_push_tokens" ON push_tokens;
CREATE POLICY "update_own_push_tokens" ON push_tokens FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_push_tokens" ON push_tokens;
CREATE POLICY "delete_own_push_tokens" ON push_tokens FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 2. Work order change notification trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_work_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  changed_fields text[] := ARRAY[]::text[];
  change_summary text;
  tech_id uuid;
BEGIN
  -- Only fire on UPDATE, not INSERT (INSERT assignment is handled by existing trigger)
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Must have an assigned technician
  tech_id := NEW.assigned_to;
  IF tech_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Don't notify the person who made the change (admin editing their own stuff)
  -- auth.uid() returns the calling user's id; if it matches the tech, skip
  IF auth.uid() = tech_id THEN
    RETURN NEW;
  END IF;

  -- Detect which fields changed
  IF OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date THEN
    changed_fields := changed_fields || ARRAY['scheduled date'];
  END IF;
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    changed_fields := changed_fields || ARRAY['description'];
  END IF;
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    changed_fields := changed_fields || ARRAY['title'];
  END IF;
  IF OLD.address IS DISTINCT FROM NEW.address THEN
    changed_fields := changed_fields || ARRAY['address'];
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    changed_fields := changed_fields || ARRAY['status'];
  END IF;
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    changed_fields := changed_fields || ARRAY['priority'];
  END IF;
  IF OLD.service_location_address IS DISTINCT FROM NEW.service_location_address THEN
    changed_fields := changed_fields || ARRAY['service location'];
  END IF;
  IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN
    changed_fields := changed_fields || ARRAY['start date'];
  END IF;
  IF OLD.target_completion_date IS DISTINCT FROM NEW.target_completion_date THEN
    changed_fields := changed_fields || ARRAY['due date'];
  END IF;

  -- If nothing relevant changed, skip
  IF array_length(changed_fields, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build a human-readable summary
  change_summary := array_to_string(changed_fields, ', ');

  -- Insert notification for the assigned technician
  INSERT INTO notifications (
    user_id,
    title,
    body,
    type,
    related_id,
    organization_id,
    is_read,
    created_at
  ) VALUES (
    tech_id,
    'Work Order Updated',
    'Work Order ' || NEW.work_order_number || ' has been updated: ' || change_summary || '. ' || COALESCE(NEW.title, ''),
    'work_order_change',
    NEW.id,
    NEW.organization_id,
    false,
    now()
  );

  RETURN NEW;
END;
$function$;

-- Drop and recreate the trigger (idempotent)
DROP TRIGGER IF EXISTS work_order_change_notification ON work_orders;
CREATE TRIGGER work_order_change_notification
  AFTER UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_work_order_change();

-- ============================================================
-- 3. Push dispatch via pg_notify when notifications are created
-- ============================================================

CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Send a NOTIFY event so a listener can push to mobile devices
  -- The payload includes the notification id and user id
  PERFORM pg_notify(
    'new_notification',
    json_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'type', NEW.type,
      'related_id', NEW.related_id
    )::text
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS dispatch_push_on_notification ON notifications;
CREATE TRIGGER dispatch_push_on_notification
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION dispatch_push_on_notification();

-- ============================================================
-- 4. updated_at trigger for push_tokens
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_push_tokens_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS push_tokens_updated_at ON push_tokens;
CREATE TRIGGER push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_tokens_updated_at();
