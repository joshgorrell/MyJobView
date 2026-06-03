/*
  # Create Custom Calendars System

  1. New Tables
    - `calendars`
      - `id` (uuid, primary key)
      - `name` (text) - Calendar name (e.g., "Topeka Office", "Manhattan Team")
      - `description` (text, optional) - Description of the calendar
      - `color` (text) - Color code for visual identification
      - `is_active` (boolean) - Whether calendar is active
      - `created_by` (uuid) - User who created the calendar
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `calendar_members`
      - `id` (uuid, primary key)
      - `calendar_id` (uuid) - Reference to calendars
      - `user_id` (uuid) - Reference to profiles
      - `is_default` (boolean) - Whether this is the user's default calendar
      - `added_by` (uuid) - User who added this member
      - `added_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Users can view calendars they are members of or created
    - Only admins and calendar creators can manage calendar membership
    - Only admins and calendar creators can edit/delete calendars
*/

-- Create calendars table
CREATE TABLE IF NOT EXISTS calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text DEFAULT '#3B82F6',
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create calendar_members table
CREATE TABLE IF NOT EXISTS calendar_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_default boolean DEFAULT false,
  added_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  added_at timestamptz DEFAULT now(),
  UNIQUE(calendar_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_calendars_created_by ON calendars(created_by);
CREATE INDEX IF NOT EXISTS idx_calendars_is_active ON calendars(is_active);
CREATE INDEX IF NOT EXISTS idx_calendar_members_calendar_id ON calendar_members(calendar_id);
CREATE INDEX IF NOT EXISTS idx_calendar_members_user_id ON calendar_members(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_members_is_default ON calendar_members(user_id, is_default) WHERE is_default = true;

-- Enable RLS
ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_members ENABLE ROW LEVEL SECURITY;

-- Calendars policies
CREATE POLICY "Users can view calendars they are members of or created"
  ON calendars FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM calendar_members
      WHERE calendar_members.calendar_id = calendars.id
      AND calendar_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can create calendars"
  ON calendars FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'field_supervisor')
    )
  );

CREATE POLICY "Admins and calendar creators can update calendars"
  ON calendars FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins and calendar creators can delete calendars"
  ON calendars FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Calendar members policies
CREATE POLICY "Users can view members of their calendars"
  ON calendar_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM calendars
      WHERE calendars.id = calendar_members.calendar_id
      AND (
        calendars.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM calendar_members cm
          WHERE cm.calendar_id = calendars.id
          AND cm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Admins and calendar creators can add members"
  ON calendar_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM calendars
      WHERE calendars.id = calendar_members.calendar_id
      AND (
        calendars.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Users can update their own default calendar setting"
  ON calendar_members FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM calendars
      WHERE calendars.id = calendar_members.calendar_id
      AND (
        calendars.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Admins and calendar creators can remove members"
  ON calendar_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM calendars
      WHERE calendars.id = calendar_members.calendar_id
      AND (
        calendars.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      )
    )
  );

-- Function to ensure only one default calendar per user
CREATE OR REPLACE FUNCTION enforce_single_default_calendar()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    -- Unset all other default calendars for this user
    UPDATE calendar_members
    SET is_default = false
    WHERE user_id = NEW.user_id
    AND calendar_id != NEW.calendar_id
    AND is_default = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER ensure_single_default_calendar
  BEFORE INSERT OR UPDATE ON calendar_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_default_calendar();

-- Function to get user's accessible calendars
CREATE OR REPLACE FUNCTION get_user_calendars(user_id_param uuid)
RETURNS TABLE (
  calendar_id uuid,
  calendar_name text,
  calendar_color text,
  is_default boolean,
  member_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as calendar_id,
    c.name as calendar_name,
    c.color as calendar_color,
    COALESCE(cm.is_default, false) as is_default,
    COUNT(DISTINCT cm2.user_id) as member_count
  FROM calendars c
  LEFT JOIN calendar_members cm ON cm.calendar_id = c.id AND cm.user_id = user_id_param
  LEFT JOIN calendar_members cm2 ON cm2.calendar_id = c.id
  WHERE c.is_active = true
  AND (
    c.created_by = user_id_param
    OR EXISTS (
      SELECT 1 FROM calendar_members
      WHERE calendar_members.calendar_id = c.id
      AND calendar_members.user_id = user_id_param
    )
  )
  GROUP BY c.id, c.name, c.color, cm.is_default
  ORDER BY cm.is_default DESC NULLS LAST, c.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
