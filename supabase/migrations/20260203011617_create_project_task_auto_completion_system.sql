/*
  # Project Task Auto-Completion System

  1. New Fields
    - Add `is_auto_completed` boolean to project_tasks table
    - Add `auto_completed_by` uuid field to track which completion triggered auto-complete
    - Add `auto_completion_enabled` setting to company_settings
    - Add `auto_completion_requires_approval` setting to company_settings
    - Add `auto_completion_reopen_on_delete` setting to company_settings

  2. Database Functions
    - `check_project_task_completion()` - Checks if a project task should be marked complete
    - `reopen_project_task()` - Reopens a project task if all completions are deleted

  3. Triggers
    - AFTER INSERT on work_order_task_completions - Auto-complete project tasks
    - AFTER DELETE on work_order_task_completions - Reopen project tasks if needed

  4. Indexes
    - Add index on work_order_task_completions(project_task_id) for performance
    - Add index on work_order_tasks(project_task_id) for lookups

  5. Security
    - RLS policies remain unchanged as they inherit from existing table policies
*/

-- Add auto-completion tracking fields to project_tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_tasks' AND column_name = 'is_auto_completed'
  ) THEN
    ALTER TABLE project_tasks ADD COLUMN is_auto_completed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_tasks' AND column_name = 'auto_completed_by'
  ) THEN
    ALTER TABLE project_tasks ADD COLUMN auto_completed_by uuid REFERENCES work_order_task_completions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add auto-completion settings to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'auto_completion_enabled'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN auto_completion_enabled boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'auto_completion_requires_approval'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN auto_completion_requires_approval boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'auto_completion_reopen_on_delete'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN auto_completion_reopen_on_delete boolean DEFAULT true;
  END IF;
END $$;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_work_order_task_completions_project_task_id 
  ON work_order_task_completions(project_task_id) 
  WHERE project_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_order_tasks_project_task_id 
  ON work_order_tasks(project_task_id) 
  WHERE project_task_id IS NOT NULL;

-- Function to check and auto-complete project tasks
CREATE OR REPLACE FUNCTION check_project_task_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_task_id uuid;
  v_auto_completion_enabled boolean;
  v_requires_approval boolean;
BEGIN
  -- Get the project_task_id (either from NEW or from work_order_tasks)
  v_project_task_id := NEW.project_task_id;
  
  -- If not directly set, try to get from work_order_tasks
  IF v_project_task_id IS NULL AND NEW.work_order_task_id IS NOT NULL THEN
    SELECT project_task_id INTO v_project_task_id
    FROM work_order_tasks
    WHERE id = NEW.work_order_task_id;
  END IF;

  -- Exit if no project task is linked
  IF v_project_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check company settings
  SELECT 
    COALESCE(auto_completion_enabled, true),
    COALESCE(auto_completion_requires_approval, false)
  INTO v_auto_completion_enabled, v_requires_approval
  FROM company_settings
  LIMIT 1;

  -- If auto-completion is disabled or requires approval, don't auto-complete
  IF NOT v_auto_completion_enabled OR v_requires_approval THEN
    RETURN NEW;
  END IF;

  -- Auto-complete the project task if not already completed
  UPDATE project_tasks
  SET 
    status = 'completed',
    completed_at = NEW.completed_at,
    is_auto_completed = true,
    auto_completed_by = NEW.id
  WHERE 
    id = v_project_task_id 
    AND status != 'completed';

  RETURN NEW;
END;
$$;

-- Function to reopen project tasks when completions are deleted
CREATE OR REPLACE FUNCTION reopen_project_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_task_id uuid;
  v_reopen_enabled boolean;
  v_has_other_completions boolean;
BEGIN
  -- Get the project_task_id (either from OLD or from work_order_tasks)
  v_project_task_id := OLD.project_task_id;
  
  -- If not directly set, try to get from work_order_tasks
  IF v_project_task_id IS NULL AND OLD.work_order_task_id IS NOT NULL THEN
    SELECT project_task_id INTO v_project_task_id
    FROM work_order_tasks
    WHERE id = OLD.work_order_task_id;
  END IF;

  -- Exit if no project task is linked
  IF v_project_task_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Check if reopen on delete is enabled
  SELECT COALESCE(auto_completion_reopen_on_delete, true)
  INTO v_reopen_enabled
  FROM company_settings
  LIMIT 1;

  IF NOT v_reopen_enabled THEN
    RETURN OLD;
  END IF;

  -- Check if there are any other completions for this project task
  SELECT EXISTS(
    SELECT 1 
    FROM work_order_task_completions 
    WHERE project_task_id = v_project_task_id
    AND id != OLD.id
  ) INTO v_has_other_completions;

  -- Only check work_order_tasks if no direct completions found
  IF NOT v_has_other_completions THEN
    SELECT EXISTS(
      SELECT 1 
      FROM work_order_task_completions wotc
      JOIN work_order_tasks wot ON wot.id = wotc.work_order_task_id
      WHERE wot.project_task_id = v_project_task_id
      AND wotc.id != OLD.id
    ) INTO v_has_other_completions;
  END IF;

  -- If no other completions exist, reopen the project task
  IF NOT v_has_other_completions THEN
    UPDATE project_tasks
    SET 
      status = 'open',
      completed_at = NULL,
      is_auto_completed = false,
      auto_completed_by = NULL
    WHERE 
      id = v_project_task_id 
      AND is_auto_completed = true;
  END IF;

  RETURN OLD;
END;
$$;

-- Create triggers for auto-completion
DROP TRIGGER IF EXISTS trigger_auto_complete_project_task ON work_order_task_completions;
CREATE TRIGGER trigger_auto_complete_project_task
  AFTER INSERT ON work_order_task_completions
  FOR EACH ROW
  EXECUTE FUNCTION check_project_task_completion();

DROP TRIGGER IF EXISTS trigger_reopen_project_task ON work_order_task_completions;
CREATE TRIGGER trigger_reopen_project_task
  AFTER DELETE ON work_order_task_completions
  FOR EACH ROW
  EXECUTE FUNCTION reopen_project_task();

-- Add constraint to prevent duplicate completions by same tech on same task
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tech_project_task_completion
  ON work_order_task_completions(technician_id, project_task_id, work_order_id)
  WHERE project_task_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tech_work_order_task_completion
  ON work_order_task_completions(technician_id, work_order_task_id, work_order_id)
  WHERE work_order_task_id IS NOT NULL;
