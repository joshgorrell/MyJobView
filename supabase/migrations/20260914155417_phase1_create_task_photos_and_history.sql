/*
# Phase 1: Create task_photos and task_history tables + task history trigger

## 1. task_photos (NEW TABLE)
Generalized photo storage for project tasks. Typed FK to project_tasks from day one.
Separate from the existing punchlist_task_photos table, which is NOT altered.

Columns:
- id (uuid PK)
- task_id (uuid, FK to project_tasks ON DELETE CASCADE, NOT NULL)
  - If a project task is deleted, its photos are deleted with it.
- photo_url (text, NOT NULL)
- caption (text, nullable)
- uploaded_at (timestamptz, default now())
- uploaded_by (uuid, nullable, FK to profiles ON DELETE SET NULL)
  - SET NULL preserves the photo record if the staff profile is removed.
- organization_id (uuid, NOT NULL, default get_user_org_id(), FK to organizations)

## 2. task_history (NEW TABLE)
Generalized audit trail for project task changes. Typed FK to project_tasks from day one.
Separate from the existing punchlist_task_history table, which is NOT altered.

Columns:
- id (uuid PK)
- task_id (uuid, FK to project_tasks ON DELETE CASCADE, NOT NULL)
  - If a project task is deleted, its history is deleted with it.
- changed_by (uuid, nullable, FK to profiles ON DELETE SET NULL)
  - SET NULL preserves the history record if the staff profile is removed.
- change_type (text, NOT NULL)
  - Values: created, updated, completed, status_changed, visibility_changed, assigned, photo_added
- old_values (jsonb, nullable)
- new_values (jsonb, nullable)
- created_at (timestamptz, default now())
- organization_id (uuid, NOT NULL, default get_user_org_id(), FK to organizations)

## 3. RLS
Both tables get organization-scoped policies matching the project_tasks pattern.
task_history allows SELECT for all same-org staff (audit trail visibility) but
does NOT allow manual INSERT/UPDATE/DELETE — history is written only by the trigger.

## 4. Indexes
- task_photos(task_id)
- task_history(task_id)

## 5. Task History Trigger
- Function: log_project_task_history()
- Fires AFTER INSERT OR UPDATE on project_tasks
- On INSERT: records change_type 'created' with new_values
- On UPDATE: records change_type 'updated' with old/new values for changed columns
  among: title, description, status, visibility, assigned_to, labor_phase_id, estimated_hours
- Inserts into task_history with auth.uid() as changed_by
- SECURITY DEFINER, search_path = public
*/

-- ============================================================
-- 1. task_photos
-- ============================================================
CREATE TABLE IF NOT EXISTS task_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL DEFAULT get_user_org_id() REFERENCES organizations(id)
);

ALTER TABLE task_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_photos_select_same_org" ON task_photos;
CREATE POLICY "task_photos_select_same_org"
  ON task_photos FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "task_photos_insert_same_org" ON task_photos;
CREATE POLICY "task_photos_insert_same_org"
  ON task_photos FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "task_photos_update_same_org" ON task_photos;
CREATE POLICY "task_photos_update_same_org"
  ON task_photos FOR UPDATE
  TO authenticated USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "task_photos_delete_same_org" ON task_photos;
CREATE POLICY "task_photos_delete_same_org"
  ON task_photos FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

CREATE INDEX IF NOT EXISTS idx_task_photos_task_id ON task_photos(task_id);

-- ============================================================
-- 2. task_history
-- ============================================================
CREATE TABLE IF NOT EXISTS task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  change_type text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL DEFAULT get_user_org_id() REFERENCES organizations(id)
);

ALTER TABLE task_history ENABLE ROW LEVEL SECURITY;

-- History is read-only for all staff (audit trail). Only the trigger inserts.
DROP POLICY IF EXISTS "task_history_select_same_org" ON task_history;
CREATE POLICY "task_history_select_same_org"
  ON task_history FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

-- No INSERT/UPDATE/DELETE policies — history is managed exclusively by the trigger
-- function (SECURITY DEFINER), so authenticated users cannot manually write history.

CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);

-- ============================================================
-- 3. Task History Trigger
-- ============================================================
CREATE OR REPLACE FUNCTION log_project_task_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_changed_by uuid;
  v_old_values jsonb;
  v_new_values jsonb;
  v_change_type text;
BEGIN
  v_org_id := NEW.organization_id;
  v_changed_by := auth.uid();

  IF (TG_OP = 'INSERT') THEN
    v_change_type := 'created';
    v_new_values := jsonb_build_object(
      'title', NEW.title,
      'description', NEW.description,
      'source', NEW.source,
      'visibility', NEW.visibility,
      'assigned_to', NEW.assigned_to,
      'labor_phase_id', NEW.labor_phase_id,
      'estimated_hours', NEW.estimated_hours,
      'status', NEW.status
    );

    INSERT INTO task_history (task_id, changed_by, change_type, old_values, new_values, organization_id)
    VALUES (NEW.id, v_changed_by, v_change_type, NULL, v_new_values, v_org_id);

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Build old/new values only for tracked columns that actually changed
    v_old_values := '{}'::jsonb;
    v_new_values := '{}'::jsonb;

    IF OLD.title IS DISTINCT FROM NEW.title THEN
      v_old_values := v_old_values || jsonb_build_object('title', OLD.title);
      v_new_values := v_new_values || jsonb_build_object('title', NEW.title);
    END IF;
    IF OLD.description IS DISTINCT FROM NEW.description THEN
      v_old_values := v_old_values || jsonb_build_object('description', OLD.description);
      v_new_values := v_new_values || jsonb_build_object('description', NEW.description);
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_old_values := v_old_values || jsonb_build_object('status', OLD.status);
      v_new_values := v_new_values || jsonb_build_object('status', NEW.status);
    END IF;
    IF OLD.visibility IS DISTINCT FROM NEW.visibility THEN
      v_old_values := v_old_values || jsonb_build_object('visibility', OLD.visibility);
      v_new_values := v_new_values || jsonb_build_object('visibility', NEW.visibility);
    END IF;
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      v_old_values := v_old_values || jsonb_build_object('assigned_to', OLD.assigned_to);
      v_new_values := v_new_values || jsonb_build_object('assigned_to', NEW.assigned_to);
    END IF;
    IF OLD.labor_phase_id IS DISTINCT FROM NEW.labor_phase_id THEN
      v_old_values := v_old_values || jsonb_build_object('labor_phase_id', OLD.labor_phase_id);
      v_new_values := v_new_values || jsonb_build_object('labor_phase_id', NEW.labor_phase_id);
    END IF;
    IF OLD.estimated_hours IS DISTINCT FROM NEW.estimated_hours THEN
      v_old_values := v_old_values || jsonb_build_object('estimated_hours', OLD.estimated_hours);
      v_new_values := v_new_values || jsonb_build_object('estimated_hours', NEW.estimated_hours);
    END IF;

    -- Only insert a history row if something actually changed
    IF v_new_values <> '{}'::jsonb THEN
      v_change_type := 'updated';

      INSERT INTO task_history (task_id, changed_by, change_type, old_values, new_values, organization_id)
      VALUES (NEW.id, v_changed_by, v_change_type, v_old_values, v_new_values, v_org_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_project_task_history_trigger ON project_tasks;
CREATE TRIGGER log_project_task_history_trigger
  AFTER INSERT OR UPDATE ON project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_project_task_history();