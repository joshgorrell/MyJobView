/*
  # Create Project Tasks and Work Order Enhancements

  1. New Tables
    - `project_tasks` - Master task list for each project, sourced from approved proposals
    - `work_order_task_completions` - Track task completion per technician per work order

  2. Enhancements to Existing Tables
    - Add `work_order_group_id` to work_orders for linking sibling work orders (multi-tech assignments)
    - Add `labor_phase_id` to work_orders for phase-based task filtering
    - Add `is_group_work_order` to work_orders to indicate multi-tech work order
    - Add `shared_task` to work_order_tasks to indicate group-shared tasks
    - Add `project_task_id` to work_order_tasks for linking to project master tasks
    - Add `completed_by` to work_order_tasks for tracking who completed the task
    - Modify work_orders.project_id to allow NULL for service work orders

  3. Security
    - Enable RLS on new tables
    - Add policies for project managers, technicians, and admins

  4. Indexes
    - Add indexes on all foreign keys and filtering fields
*/

-- =====================================================
-- 1. CREATE PROJECT_TASKS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  labor_phase_id uuid REFERENCES labor_phases(id) ON DELETE SET NULL,
  estimated_hours numeric DEFAULT 0,
  status text DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  sort_order integer DEFAULT 0,
  source_line_item_id uuid,
  source_phase_id uuid,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for project_tasks
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_labor_phase_id ON project_tasks(labor_phase_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_sort_order ON project_tasks(project_id, sort_order);

-- =====================================================
-- 2. CREATE WORK_ORDER_TASK_COMPLETIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS work_order_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  project_task_id uuid REFERENCES project_tasks(id) ON DELETE CASCADE,
  work_order_task_id uuid REFERENCES work_order_tasks(id) ON DELETE CASCADE,
  technician_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  completed_at timestamptz DEFAULT now(),
  actual_hours numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT task_reference_check CHECK (
    (project_task_id IS NOT NULL AND work_order_task_id IS NULL) OR
    (project_task_id IS NULL AND work_order_task_id IS NOT NULL)
  )
);

-- Indexes for work_order_task_completions
CREATE INDEX IF NOT EXISTS idx_wo_task_completions_work_order ON work_order_task_completions(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_task_completions_project_task ON work_order_task_completions(project_task_id);
CREATE INDEX IF NOT EXISTS idx_wo_task_completions_wo_task ON work_order_task_completions(work_order_task_id);
CREATE INDEX IF NOT EXISTS idx_wo_task_completions_technician ON work_order_task_completions(technician_id);

-- =====================================================
-- 3. ENHANCE WORK_ORDERS TABLE
-- =====================================================

-- Add work_order_group_id for linking sibling work orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'work_order_group_id'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN work_order_group_id uuid;
  END IF;
END $$;

-- Add labor_phase_id for phase-based task filtering
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'labor_phase_id'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN labor_phase_id uuid REFERENCES labor_phases(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add is_group_work_order flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'is_group_work_order'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN is_group_work_order boolean DEFAULT false;
  END IF;
END $$;

-- Create index on work_order_group_id
CREATE INDEX IF NOT EXISTS idx_work_orders_group_id ON work_orders(work_order_group_id) WHERE work_order_group_id IS NOT NULL;

-- Create index on labor_phase_id
CREATE INDEX IF NOT EXISTS idx_work_orders_labor_phase_id ON work_orders(labor_phase_id) WHERE labor_phase_id IS NOT NULL;

-- Modify constraint to allow NULL project_id for service work orders
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_project_id_fkey;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- =====================================================
-- 4. ENHANCE WORK_ORDER_TASKS TABLE
-- =====================================================

-- Add shared_task flag for group work orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_order_tasks' AND column_name = 'shared_task'
  ) THEN
    ALTER TABLE work_order_tasks ADD COLUMN shared_task boolean DEFAULT false;
  END IF;
END $$;

-- Add project_task_id for linking to master project tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_order_tasks' AND column_name = 'project_task_id'
  ) THEN
    ALTER TABLE work_order_tasks ADD COLUMN project_task_id uuid REFERENCES project_tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add completed_by for tracking who completed the task
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_order_tasks' AND column_name = 'completed_by'
  ) THEN
    ALTER TABLE work_order_tasks ADD COLUMN completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index on project_task_id
CREATE INDEX IF NOT EXISTS idx_work_order_tasks_project_task_id ON work_order_tasks(project_task_id) WHERE project_task_id IS NOT NULL;

-- =====================================================
-- 5. ENABLE RLS ON NEW TABLES
-- =====================================================

ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_task_completions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. RLS POLICIES FOR PROJECT_TASKS
-- =====================================================

-- Project managers, admins, and assigned technicians can view project tasks
CREATE POLICY "Users can view project tasks"
  ON project_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_tasks.project_id
      AND (
        p.assigned_pm = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'production_manager')
        ) OR
        EXISTS (
          SELECT 1 FROM work_orders wo
          WHERE wo.project_id = p.id
          AND wo.assigned_to = auth.uid()
        )
      )
    )
  );

-- Project managers and admins can create project tasks
CREATE POLICY "Managers can create project tasks"
  ON project_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'production_manager')
    )
  );

-- Project managers and admins can update project tasks
CREATE POLICY "Managers can update project tasks"
  ON project_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'production_manager')
    )
  );

-- Project managers and admins can delete project tasks
CREATE POLICY "Managers can delete project tasks"
  ON project_tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'production_manager')
    )
  );

-- =====================================================
-- 7. RLS POLICIES FOR WORK_ORDER_TASK_COMPLETIONS
-- =====================================================

-- Technicians and managers can view task completions for relevant work orders
CREATE POLICY "Users can view task completions"
  ON work_order_task_completions FOR SELECT
  TO authenticated
  USING (
    technician_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = work_order_task_completions.work_order_id
      AND (
        wo.assigned_to = auth.uid() OR
        wo.work_order_group_id IN (
          SELECT work_order_group_id FROM work_orders
          WHERE assigned_to = auth.uid()
          AND work_order_group_id IS NOT NULL
        ) OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'production_manager')
        )
      )
    )
  );

-- Technicians can create their own task completions
CREATE POLICY "Technicians can create task completions"
  ON work_order_task_completions FOR INSERT
  TO authenticated
  WITH CHECK (
    technician_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = work_order_task_completions.work_order_id
      AND wo.assigned_to = auth.uid()
    )
  );

-- Technicians can update their own completions, managers can update all
CREATE POLICY "Users can update task completions"
  ON work_order_task_completions FOR UPDATE
  TO authenticated
  USING (
    technician_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'production_manager')
    )
  );

-- Technicians can delete their own completions, managers can delete all
CREATE POLICY "Users can delete task completions"
  ON work_order_task_completions FOR DELETE
  TO authenticated
  USING (
    technician_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'production_manager')
    )
  );

-- =====================================================
-- 8. UPDATE WORK_ORDER_TASKS RLS POLICIES
-- =====================================================

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Users can view tasks for their work orders" ON work_order_tasks;
DROP POLICY IF EXISTS "Managers can manage work order tasks" ON work_order_tasks;

-- Recreate with group work order support
CREATE POLICY "Users can view work order tasks"
  ON work_order_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = work_order_tasks.work_order_id
      AND (
        wo.assigned_to = auth.uid() OR
        work_order_tasks.assigned_to = auth.uid() OR
        -- Allow viewing shared tasks in group work orders
        (work_order_tasks.shared_task = true AND wo.work_order_group_id IN (
          SELECT work_order_group_id FROM work_orders
          WHERE assigned_to = auth.uid()
          AND work_order_group_id IS NOT NULL
        )) OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'production_manager')
        )
      )
    )
  );

CREATE POLICY "Managers can manage work order tasks"
  ON work_order_tasks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'production_manager')
    )
  );

-- Technicians can update tasks for their work orders
CREATE POLICY "Technicians can update their work order tasks"
  ON work_order_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = work_order_tasks.work_order_id
      AND wo.assigned_to = auth.uid()
    )
  );

-- =====================================================
-- 9. CREATE UPDATED_AT TRIGGER FOR PROJECT_TASKS
-- =====================================================

CREATE OR REPLACE FUNCTION update_project_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_project_tasks_updated_at ON project_tasks;
CREATE TRIGGER update_project_tasks_updated_at
  BEFORE UPDATE ON project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_project_tasks_updated_at();
