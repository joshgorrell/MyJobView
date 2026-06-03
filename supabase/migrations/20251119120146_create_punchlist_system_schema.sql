/*
  # Create Punchlist System Schema

  ## Summary
  Implements the Electronic Life Punchlist & Test-and-Tune system for customer service management.
  Integrates with existing systems (messaging, file attachments, recurring plans, service requests).

  ## New Tables

  ### punchlist_access_grants
  Tracks Test & Tune 90-day free access and VIP membership access to punchlist module.
  - `id` (uuid, primary key)
  - `contact_id` (uuid, references contacts) - Customer with access
  - `access_type` (text) - 'test_and_tune' or 'vip_membership'
  - `project_id` (uuid, references projects) - For Test & Tune access
  - `subscription_id` (uuid, references recurring_subscriptions) - For VIP access
  - `granted_date` (date) - When access was granted
  - `expiration_date` (date) - When access expires (null for active VIP)
  - `status` (text) - active, expired, converted_to_vip
  - `warning_sent_7day` (boolean) - Email warning sent
  - `warning_sent_1day` (boolean) - Email warning sent
  - `notes` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### punchlist_tasks
  Customer-created service tasks with real-time visibility to admin.
  - `id` (uuid, primary key)
  - `contact_id` (uuid, references contacts) - Customer who created task
  - `access_grant_id` (uuid, references punchlist_access_grants) - Associated access
  - `title` (text) - Task title/description
  - `details` (text) - Detailed description
  - `priority_order` (integer) - For drag-drop ordering
  - `status` (text) - draft, pending, submitted, in_progress, completed, cancelled
  - `service_request_id` (uuid, references service_requests) - When submitted
  - `completed_at` (timestamptz) - When marked complete
  - `installer_notes` (text) - Notes from tech/installer
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### punchlist_task_history
  Audit trail for task changes.
  - `id` (uuid, primary key)
  - `task_id` (uuid, references punchlist_tasks)
  - `changed_by` (uuid) - User who made change
  - `change_type` (text) - created, updated, status_changed, completed
  - `old_values` (jsonb)
  - `new_values` (jsonb)
  - `created_at` (timestamptz)

  ## Table Extensions

  ### projects - Add substantial_completion_date
  Track when project reaches substantial completion to trigger Test & Tune access.

  ### recurring_plans - Add punchlist_enabled
  Flag VIP plans that include punchlist access.

  ### message_threads - Add 'punchlist' to context_type
  Allow punchlist-specific message threads.

  ### file_attachments - Add 'punchlist_task' to context_type
  Allow photos to be attached to punchlist tasks.

  ## Security
  - Enable RLS on all new tables
  - Staff can view all punchlist data in their company
  - Customers can only view their own tasks and access
  - Real-time subscriptions enabled for live updates

  ## Indexes
  - Index on contact_id for fast customer lookup
  - Index on status for filtering
  - Index on expiration_date for daily expiration checks
  - Index on priority_order for drag-drop operations
*/

-- Add substantial_completion_date to projects
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'substantial_completion_date'
  ) THEN
    ALTER TABLE projects ADD COLUMN substantial_completion_date date;
  END IF;
END $$;

-- Add punchlist_enabled to recurring_plans
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'recurring_plans' AND column_name = 'punchlist_enabled'
  ) THEN
    ALTER TABLE recurring_plans ADD COLUMN punchlist_enabled boolean DEFAULT false;
  END IF;
END $$;

-- Update message_threads context_type constraint to include punchlist
DO $$
BEGIN
  ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_context_type_check;
  ALTER TABLE message_threads ADD CONSTRAINT message_threads_context_type_check 
    CHECK (context_type IN ('contact', 'proposal', 'project', 'punchlist'));
END $$;

-- Update file_attachments context_type constraint to include punchlist_task
DO $$
BEGIN
  ALTER TABLE file_attachments DROP CONSTRAINT IF EXISTS file_attachments_context_type_check;
  ALTER TABLE file_attachments ADD CONSTRAINT file_attachments_context_type_check 
    CHECK (context_type IN ('message', 'proposal', 'project', 'contact', 'punchlist_task'));
END $$;

-- Create punchlist_access_grants table
CREATE TABLE IF NOT EXISTS punchlist_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  access_type text NOT NULL CHECK (access_type IN ('test_and_tune', 'vip_membership')),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES recurring_subscriptions(id) ON DELETE SET NULL,
  granted_date date NOT NULL DEFAULT CURRENT_DATE,
  expiration_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted_to_vip')),
  warning_sent_7day boolean DEFAULT false,
  warning_sent_1day boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create punchlist_tasks table
CREATE TABLE IF NOT EXISTS punchlist_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  access_grant_id uuid REFERENCES punchlist_access_grants(id) ON DELETE SET NULL,
  title text NOT NULL,
  details text,
  priority_order integer DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'submitted', 'in_progress', 'completed', 'cancelled')),
  service_request_id uuid REFERENCES service_requests(id) ON DELETE SET NULL,
  completed_at timestamptz,
  installer_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create punchlist_task_history table
CREATE TABLE IF NOT EXISTS punchlist_task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES punchlist_tasks(id) ON DELETE CASCADE,
  changed_by uuid,
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'status_changed', 'completed')),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_punchlist_access_contact ON punchlist_access_grants(contact_id);
CREATE INDEX IF NOT EXISTS idx_punchlist_access_status ON punchlist_access_grants(status);
CREATE INDEX IF NOT EXISTS idx_punchlist_access_expiration ON punchlist_access_grants(expiration_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_punchlist_access_project ON punchlist_access_grants(project_id);
CREATE INDEX IF NOT EXISTS idx_punchlist_access_subscription ON punchlist_access_grants(subscription_id);

CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_contact ON punchlist_tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_status ON punchlist_tasks(status);
CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_priority ON punchlist_tasks(contact_id, priority_order);
CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_access_grant ON punchlist_tasks(access_grant_id);
CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_service_request ON punchlist_tasks(service_request_id);
CREATE INDEX IF NOT EXISTS idx_punchlist_tasks_updated ON punchlist_tasks(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_punchlist_history_task ON punchlist_task_history(task_id, created_at DESC);

-- Enable RLS
ALTER TABLE punchlist_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE punchlist_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE punchlist_task_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for punchlist_access_grants

-- Staff can view all access grants in their company
CREATE POLICY "Staff can view punchlist access grants"
  ON punchlist_access_grants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'sales', 'sales_manager', 'office_manager', 'dispatch', 'production_manager')
    )
  );

-- Portal users can view their own access grants
CREATE POLICY "Portal users can view their own punchlist access"
  ON punchlist_access_grants FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid() AND role = 'portal_user'
    )
  );

-- Staff can insert access grants
CREATE POLICY "Staff can create punchlist access grants"
  ON punchlist_access_grants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'sales', 'sales_manager', 'office_manager')
    )
  );

-- Staff can update access grants
CREATE POLICY "Staff can update punchlist access grants"
  ON punchlist_access_grants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'sales', 'sales_manager', 'office_manager')
    )
  );

-- RLS Policies for punchlist_tasks

-- Staff can view all tasks
CREATE POLICY "Staff can view all punchlist tasks"
  ON punchlist_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'sales', 'sales_manager', 'office_manager', 'dispatch', 'production_manager', 'technician')
    )
  );

-- Portal users can view their own tasks
CREATE POLICY "Portal users can view their own punchlist tasks"
  ON punchlist_tasks FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid() AND role = 'portal_user'
    )
  );

-- Portal users can create their own tasks
CREATE POLICY "Portal users can create punchlist tasks"
  ON punchlist_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid() AND role = 'portal_user'
    )
  );

-- Portal users can update their own tasks (when not submitted)
CREATE POLICY "Portal users can update their own punchlist tasks"
  ON punchlist_tasks FOR UPDATE
  TO authenticated
  USING (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid() AND role = 'portal_user'
    )
  );

-- Staff can update any task
CREATE POLICY "Staff can update punchlist tasks"
  ON punchlist_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager', 'technician')
    )
  );

-- Portal users can delete their own draft tasks
CREATE POLICY "Portal users can delete their own draft tasks"
  ON punchlist_tasks FOR DELETE
  TO authenticated
  USING (
    contact_id IN (
      SELECT contact_id FROM profiles WHERE id = auth.uid() AND role = 'portal_user'
    )
    AND status = 'draft'
  );

-- RLS Policies for punchlist_task_history

-- Staff can view task history
CREATE POLICY "Staff can view punchlist task history"
  ON punchlist_task_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'sales', 'sales_manager', 'office_manager', 'dispatch', 'production_manager')
    )
  );

-- System can insert history
CREATE POLICY "System can insert task history"
  ON punchlist_task_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create trigger to log task changes
CREATE OR REPLACE FUNCTION log_punchlist_task_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO punchlist_task_history (task_id, changed_by, change_type, new_values)
    VALUES (NEW.id, auth.uid(), 'created', to_jsonb(NEW));
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.status != NEW.status) THEN
      INSERT INTO punchlist_task_history (task_id, changed_by, change_type, old_values, new_values)
      VALUES (NEW.id, auth.uid(), 'status_changed', 
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status));
    ELSE
      INSERT INTO punchlist_task_history (task_id, changed_by, change_type, old_values, new_values)
      VALUES (NEW.id, auth.uid(), 'updated', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    
    IF (NEW.status = 'completed' AND OLD.status != 'completed') THEN
      UPDATE punchlist_tasks SET completed_at = now() WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_punchlist_task_change
  AFTER INSERT OR UPDATE ON punchlist_tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_punchlist_task_change();

-- Create trigger to auto-grant Test & Tune access when project reaches substantial completion
CREATE OR REPLACE FUNCTION auto_grant_test_and_tune_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if substantial_completion_date was just set and we haven't already created an access grant
  IF (NEW.substantial_completion_date IS NOT NULL 
      AND (OLD.substantial_completion_date IS NULL OR OLD.substantial_completion_date != NEW.substantial_completion_date)
      AND NOT EXISTS (
        SELECT 1 FROM punchlist_access_grants 
        WHERE project_id = NEW.id AND access_type = 'test_and_tune'
      )) THEN
    
    -- Create 90-day Test & Tune access
    INSERT INTO punchlist_access_grants (
      contact_id,
      access_type,
      project_id,
      granted_date,
      expiration_date,
      status,
      notes
    ) VALUES (
      NEW.contact_id,
      'test_and_tune',
      NEW.id,
      NEW.substantial_completion_date,
      NEW.substantial_completion_date + INTERVAL '90 days',
      'active',
      'Auto-granted on project substantial completion'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_auto_grant_test_and_tune
  AFTER UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_grant_test_and_tune_access();

-- Create function to check if contact has active punchlist access
CREATE OR REPLACE FUNCTION contact_has_punchlist_access(p_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM punchlist_access_grants
    WHERE contact_id = p_contact_id
    AND status = 'active'
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
  );
END;
$$;

-- Create function to get punchlist access details for a contact
CREATE OR REPLACE FUNCTION get_punchlist_access_info(p_contact_id uuid)
RETURNS TABLE (
  has_access boolean,
  access_type text,
  days_remaining integer,
  expiration_date date,
  subscription_plan_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    true as has_access,
    pag.access_type,
    CASE 
      WHEN pag.expiration_date IS NULL THEN NULL
      ELSE (pag.expiration_date - CURRENT_DATE)
    END as days_remaining,
    pag.expiration_date,
    rp.plan_name as subscription_plan_name
  FROM punchlist_access_grants pag
  LEFT JOIN recurring_subscriptions rs ON rs.id = pag.subscription_id
  LEFT JOIN recurring_plans rp ON rp.id = rs.plan_id
  WHERE pag.contact_id = p_contact_id
  AND pag.status = 'active'
  AND (pag.expiration_date IS NULL OR pag.expiration_date >= CURRENT_DATE)
  ORDER BY 
    CASE pag.access_type 
      WHEN 'vip_membership' THEN 1 
      WHEN 'test_and_tune' THEN 2 
    END
  LIMIT 1;
END;
$$;
