/*
  # Create Production Department Schema

  ## Overview
  Creates comprehensive production management system for field operations:
  - Work orders with task assignments
  - Change orders with approval workflow
  - Materials tracking per work order
  - Punch lists for quality control
  - VIP 90-day program tracking
  - Time tracking integration

  ## New Tables

  ### `work_orders`
  Individual work assignments under projects
  - `id` (uuid, primary key)
  - `company_id` (uuid, not null)
  - `project_id` (uuid, foreign key to projects)
  - `work_order_number` (text, unique, auto-generated)
  - `title` (text, not null)
  - `description` (text)
  - `type` (text) - installation, service, repair, maintenance, inspection
  - `status` (text) - pending, assigned, in_progress, completed, on_hold, cancelled
  - `priority` (text) - low, medium, high, urgent
  - `assigned_to` (uuid, foreign key to profiles) - Lead technician
  - `start_date` (date)
  - `target_completion_date` (date)
  - `actual_completion_date` (date, nullable)
  - `estimated_hours` (numeric)
  - `actual_hours` (numeric)
  - `notes` (text)
  - `internal_notes` (text)
  - `created_by` (uuid)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - `office_id` (uuid)

  ### `work_order_tasks`
  Individual tasks within work orders
  - `id` (uuid, primary key)
  - `work_order_id` (uuid, foreign key to work_orders)
  - `title` (text, not null)
  - `description` (text)
  - `assigned_to` (uuid, foreign key to profiles)
  - `status` (text) - pending, in_progress, completed
  - `estimated_hours` (numeric)
  - `actual_hours` (numeric)
  - `sort_order` (integer)
  - `completed_at` (timestamptz, nullable)
  - `created_at` (timestamptz)

  ### `change_orders`
  Scope and pricing changes to projects
  - `id` (uuid, primary key)
  - `company_id` (uuid, not null)
  - `project_id` (uuid, foreign key to projects)
  - `change_order_number` (text, unique, auto-generated)
  - `title` (text, not null)
  - `description` (text)
  - `reason` (text) - customer_request, site_conditions, code_requirement, error, other
  - `status` (text) - draft, pending_approval, approved, rejected, completed
  - `original_amount` (numeric)
  - `change_amount` (numeric)
  - `new_total` (numeric)
  - `labor_hours_added` (numeric)
  - `requested_by` (uuid, foreign key to profiles)
  - `approved_by` (uuid, foreign key to profiles, nullable)
  - `approval_date` (timestamptz, nullable)
  - `rejection_reason` (text, nullable)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `work_order_materials`
  Materials used in work orders
  - `id` (uuid, primary key)
  - `work_order_id` (uuid, foreign key to work_orders)
  - `product_id` (uuid, foreign key to products, nullable)
  - `material_name` (text, not null)
  - `quantity` (numeric, not null)
  - `unit` (text) - each, box, roll, etc.
  - `unit_cost` (numeric)
  - `total_cost` (numeric)
  - `used_date` (date)
  - `notes` (text)
  - `created_at` (timestamptz)

  ### `punch_lists`
  Quality control checklists for work orders
  - `id` (uuid, primary key)
  - `work_order_id` (uuid, foreign key to work_orders)
  - `title` (text, not null)
  - `status` (text) - open, in_progress, completed
  - `created_by` (uuid)
  - `created_at` (timestamptz)
  - `completed_at` (timestamptz, nullable)

  ### `punch_list_items`
  Individual items on punch lists
  - `id` (uuid, primary key)
  - `punch_list_id` (uuid, foreign key to punch_lists)
  - `description` (text, not null)
  - `status` (text) - pending, completed, failed
  - `assigned_to` (uuid, foreign key to profiles, nullable)
  - `priority` (text) - low, medium, high
  - `notes` (text)
  - `completed_by` (uuid, nullable)
  - `completed_at` (timestamptz, nullable)
  - `sort_order` (integer)
  - `created_at` (timestamptz)

  ### `vip_program_tracking`
  90-day post-installation follow-up program
  - `id` (uuid, primary key)
  - `company_id` (uuid, not null)
  - `project_id` (uuid, foreign key to projects)
  - `contact_id` (uuid, foreign key to contacts)
  - `installation_date` (date, not null)
  - `day_30_scheduled` (date)
  - `day_30_completed` (date, nullable)
  - `day_30_notes` (text)
  - `day_60_scheduled` (date)
  - `day_60_completed` (date, nullable)
  - `day_60_notes` (text)
  - `day_90_scheduled` (date)
  - `day_90_completed` (date, nullable)
  - `day_90_notes` (text)
  - `status` (text) - active, completed, cancelled
  - `assigned_technician` (uuid, foreign key to profiles)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `time_entries`
  Technician time tracking for work orders
  - `id` (uuid, primary key)
  - `company_id` (uuid, not null)
  - `work_order_id` (uuid, foreign key to work_orders, nullable)
  - `technician_id` (uuid, foreign key to profiles)
  - `entry_date` (date, not null)
  - `clock_in` (timestamptz, not null)
  - `clock_out` (timestamptz, nullable)
  - `total_hours` (numeric)
  - `break_minutes` (integer, default 0)
  - `overtime_hours` (numeric, default 0)
  - `notes` (text)
  - `status` (text) - draft, submitted, approved, rejected
  - `approved_by` (uuid, nullable)
  - `approved_at` (timestamptz, nullable)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Technicians can view their assigned work
  - Project managers can manage all production data
  - Admins have full access
*/

-- Create work_orders table
CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  work_order_number text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  type text DEFAULT 'installation',
  status text DEFAULT 'pending',
  priority text DEFAULT 'medium',
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  start_date date,
  target_completion_date date,
  actual_completion_date date,
  estimated_hours numeric DEFAULT 0,
  actual_hours numeric DEFAULT 0,
  notes text,
  internal_notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  office_id uuid
);

-- Create indexes for work_orders
CREATE INDEX IF NOT EXISTS idx_work_orders_project ON work_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned ON work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_dates ON work_orders(start_date, target_completion_date);

-- Constraints for work_orders
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS valid_wo_type;
ALTER TABLE work_orders ADD CONSTRAINT valid_wo_type 
  CHECK (type IN ('installation', 'service', 'repair', 'maintenance', 'inspection'));

ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS valid_wo_status;
ALTER TABLE work_orders ADD CONSTRAINT valid_wo_status 
  CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'on_hold', 'cancelled'));

ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS valid_wo_priority;
ALTER TABLE work_orders ADD CONSTRAINT valid_wo_priority 
  CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- Create work_order_tasks table
CREATE TABLE IF NOT EXISTS work_order_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text DEFAULT 'pending',
  estimated_hours numeric DEFAULT 0,
  actual_hours numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wo_tasks_work_order ON work_order_tasks(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_tasks_assigned ON work_order_tasks(assigned_to);

ALTER TABLE work_order_tasks DROP CONSTRAINT IF EXISTS valid_task_status;
ALTER TABLE work_order_tasks ADD CONSTRAINT valid_task_status 
  CHECK (status IN ('pending', 'in_progress', 'completed'));

-- Create change_orders table
CREATE TABLE IF NOT EXISTS change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  change_order_number text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  reason text DEFAULT 'customer_request',
  status text DEFAULT 'draft',
  original_amount numeric DEFAULT 0,
  change_amount numeric DEFAULT 0,
  new_total numeric DEFAULT 0,
  labor_hours_added numeric DEFAULT 0,
  requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approval_date timestamptz,
  rejection_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_orders_project ON change_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_status ON change_orders(status);

ALTER TABLE change_orders DROP CONSTRAINT IF EXISTS valid_co_reason;
ALTER TABLE change_orders ADD CONSTRAINT valid_co_reason 
  CHECK (reason IN ('customer_request', 'site_conditions', 'code_requirement', 'error', 'other'));

ALTER TABLE change_orders DROP CONSTRAINT IF EXISTS valid_co_status;
ALTER TABLE change_orders ADD CONSTRAINT valid_co_status 
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'completed'));

-- Create work_order_materials table
CREATE TABLE IF NOT EXISTS work_order_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  material_name text NOT NULL,
  quantity numeric NOT NULL,
  unit text DEFAULT 'each',
  unit_cost numeric DEFAULT 0,
  total_cost numeric DEFAULT 0,
  used_date date DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wo_materials_work_order ON work_order_materials(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_materials_product ON work_order_materials(product_id);

-- Create punch_lists table
CREATE TABLE IF NOT EXISTS punch_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  status text DEFAULT 'open',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_punch_lists_work_order ON punch_lists(work_order_id);

ALTER TABLE punch_lists DROP CONSTRAINT IF EXISTS valid_punch_list_status;
ALTER TABLE punch_lists ADD CONSTRAINT valid_punch_list_status 
  CHECK (status IN ('open', 'in_progress', 'completed'));

-- Create punch_list_items table
CREATE TABLE IF NOT EXISTS punch_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punch_list_id uuid REFERENCES punch_lists(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  status text DEFAULT 'pending',
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  priority text DEFAULT 'medium',
  notes text,
  completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_punch_items_list ON punch_list_items(punch_list_id);

ALTER TABLE punch_list_items DROP CONSTRAINT IF EXISTS valid_punch_item_status;
ALTER TABLE punch_list_items ADD CONSTRAINT valid_punch_item_status 
  CHECK (status IN ('pending', 'completed', 'failed'));

ALTER TABLE punch_list_items DROP CONSTRAINT IF EXISTS valid_punch_item_priority;
ALTER TABLE punch_list_items ADD CONSTRAINT valid_punch_item_priority 
  CHECK (priority IN ('low', 'medium', 'high'));

-- Create vip_program_tracking table
CREATE TABLE IF NOT EXISTS vip_program_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  installation_date date NOT NULL,
  day_30_scheduled date,
  day_30_completed date,
  day_30_notes text,
  day_60_scheduled date,
  day_60_completed date,
  day_60_notes text,
  day_90_scheduled date,
  day_90_completed date,
  day_90_notes text,
  status text DEFAULT 'active',
  assigned_technician uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vip_tracking_project ON vip_program_tracking(project_id);
CREATE INDEX IF NOT EXISTS idx_vip_tracking_status ON vip_program_tracking(status);
CREATE INDEX IF NOT EXISTS idx_vip_tracking_dates ON vip_program_tracking(day_30_scheduled, day_60_scheduled, day_90_scheduled);

ALTER TABLE vip_program_tracking DROP CONSTRAINT IF EXISTS valid_vip_status;
ALTER TABLE vip_program_tracking ADD CONSTRAINT valid_vip_status 
  CHECK (status IN ('active', 'completed', 'cancelled'));

-- Create time_entries table
CREATE TABLE IF NOT EXISTS time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  technician_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  entry_date date NOT NULL,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  total_hours numeric DEFAULT 0,
  break_minutes integer DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  notes text,
  status text DEFAULT 'draft',
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_tech_date ON time_entries(technician_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_work_order ON time_entries(work_order_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON time_entries(status);

ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS valid_time_status;
ALTER TABLE time_entries ADD CONSTRAINT valid_time_status 
  CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'));

-- Function to auto-generate work order numbers
CREATE OR REPLACE FUNCTION generate_work_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.work_order_number IS NULL OR NEW.work_order_number = '' THEN
    NEW.work_order_number := 'WO-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
      LPAD(NEXTVAL('work_order_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS work_order_number_seq;

DROP TRIGGER IF EXISTS set_work_order_number ON work_orders;
CREATE TRIGGER set_work_order_number
  BEFORE INSERT ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_work_order_number();

-- Function to auto-generate change order numbers
CREATE OR REPLACE FUNCTION generate_change_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.change_order_number IS NULL OR NEW.change_order_number = '' THEN
    NEW.change_order_number := 'CO-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
      LPAD(NEXTVAL('change_order_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS change_order_number_seq;

DROP TRIGGER IF EXISTS set_change_order_number ON change_orders;
CREATE TRIGGER set_change_order_number
  BEFORE INSERT ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_change_order_number();

-- Enable RLS
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE punch_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE punch_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_program_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for work_orders
CREATE POLICY "Users can view work orders in their scope"
  ON work_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role IN ('admin', 'office_manager', 'project_manager') OR
        assigned_to = auth.uid()
      )
    )
  );

CREATE POLICY "Managers can create work orders"
  ON work_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

CREATE POLICY "Managers and assigned techs can update work orders"
  ON work_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role IN ('admin', 'office_manager', 'project_manager') OR
        assigned_to = auth.uid()
      )
    )
  );

-- RLS Policies for work_order_tasks
CREATE POLICY "Users can view tasks for their work orders"
  ON work_order_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders
      WHERE work_orders.id = work_order_tasks.work_order_id
      AND (
        work_orders.assigned_to = auth.uid() OR
        work_order_tasks.assigned_to = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager')
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
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

-- RLS Policies for change_orders
CREATE POLICY "Users can view change orders"
  ON change_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'sales')
    )
  );

CREATE POLICY "Managers can manage change orders"
  ON change_orders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

-- RLS Policies for work_order_materials
CREATE POLICY "Users can view materials for their work orders"
  ON work_order_materials FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders
      WHERE work_orders.id = work_order_materials.work_order_id
      AND (
        work_orders.assigned_to = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager')
        )
      )
    )
  );

CREATE POLICY "Techs and managers can manage materials"
  ON work_order_materials FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders
      WHERE work_orders.id = work_order_materials.work_order_id
      AND (
        work_orders.assigned_to = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager')
        )
      )
    )
  );

-- RLS Policies for punch_lists
CREATE POLICY "Users can view punch lists"
  ON punch_lists FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders
      WHERE work_orders.id = punch_lists.work_order_id
      AND (
        work_orders.assigned_to = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager')
        )
      )
    )
  );

CREATE POLICY "Managers can manage punch lists"
  ON punch_lists FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

-- RLS Policies for punch_list_items
CREATE POLICY "Users can view punch list items"
  ON punch_list_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM punch_lists
      JOIN work_orders ON work_orders.id = punch_lists.work_order_id
      WHERE punch_lists.id = punch_list_items.punch_list_id
      AND (
        work_orders.assigned_to = auth.uid() OR
        punch_list_items.assigned_to = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager')
        )
      )
    )
  );

CREATE POLICY "Assigned techs can update punch items"
  ON punch_list_items FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

-- RLS Policies for vip_program_tracking
CREATE POLICY "Users can view VIP tracking"
  ON vip_program_tracking FOR SELECT
  TO authenticated
  USING (
    assigned_technician = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

CREATE POLICY "Managers can manage VIP tracking"
  ON vip_program_tracking FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

-- RLS Policies for time_entries
CREATE POLICY "Techs can view their own time entries"
  ON time_entries FOR SELECT
  TO authenticated
  USING (
    technician_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

CREATE POLICY "Techs can create their own time entries"
  ON time_entries FOR INSERT
  TO authenticated
  WITH CHECK (technician_id = auth.uid());

CREATE POLICY "Techs can update their draft time entries"
  ON time_entries FOR UPDATE
  TO authenticated
  USING (
    technician_id = auth.uid() AND status = 'draft' OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );
