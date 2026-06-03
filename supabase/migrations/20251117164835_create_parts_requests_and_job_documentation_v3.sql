/*
  # Parts Requests & Job Documentation System

  1. New Tables
    - `parts_requests` - Tech field requests for parts
    - `job_photos` - Before/during/after documentation
    - `job_completion_templates` - Checklists per job type
    - `job_completions` - Completed job records with signatures
    - `parts_usage_log` - Track what parts were used on jobs

  2. Security
    - Enable RLS on all tables
    - Techs can create requests and photos
    - Admins approve and manage
    - Customers see their photos

  3. Features
    - Auto-log parts usage when installed
    - Template-based completion checklists
    - GPS-tagged photos
    - Customer signatures
*/

-- Create parts_requests table
CREATE TABLE IF NOT EXISTS parts_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES profiles(id) NOT NULL,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  part_name text NOT NULL,
  part_number text,
  quantity integer NOT NULL CHECK (quantity > 0),
  urgency text NOT NULL DEFAULT 'not_urgent' CHECK (urgency IN ('immediate', 'today', 'this_week', 'not_urgent')),
  reason text NOT NULL,
  photo_url text,
  estimated_cost decimal(10, 2),
  status text DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'denied', 'ordered', 'delivered', 'installed', 'cancelled')),
  requested_at timestamptz DEFAULT now(),
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  approval_notes text,
  ordered_at timestamptz,
  order_number text,
  delivered_at timestamptz,
  installed_at timestamptz,
  actual_cost decimal(10, 2),
  vendor text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parts_requests_tech ON parts_requests(technician_id);
CREATE INDEX IF NOT EXISTS idx_parts_requests_work_order ON parts_requests(work_order_id);
CREATE INDEX IF NOT EXISTS idx_parts_requests_status ON parts_requests(status);
CREATE INDEX IF NOT EXISTS idx_parts_requests_urgency ON parts_requests(urgency);
CREATE INDEX IF NOT EXISTS idx_parts_requests_requested_at ON parts_requests(requested_at);

-- Create job_photos table
CREATE TABLE IF NOT EXISTS job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  technician_id uuid REFERENCES profiles(id) NOT NULL,
  photo_url text NOT NULL,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('before', 'during', 'after', 'issue', 'solution', 'parts', 'other')),
  caption text,
  latitude decimal(10, 8),
  longitude decimal(11, 8),
  is_customer_visible boolean DEFAULT true,
  annotations jsonb,
  metadata jsonb,
  taken_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_photos_work_order ON job_photos(work_order_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_tech ON job_photos(technician_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_category ON job_photos(category);
CREATE INDEX IF NOT EXISTS idx_job_photos_customer_visible ON job_photos(is_customer_visible);
CREATE INDEX IF NOT EXISTS idx_job_photos_taken_at ON job_photos(taken_at);

-- Create job_completion_templates table
CREATE TABLE IF NOT EXISTS job_completion_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  template_name text NOT NULL,
  checklist_items jsonb NOT NULL DEFAULT '[]',
  required_photos jsonb NOT NULL DEFAULT '[]',
  requires_signature boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_templates_job_type ON job_completion_templates(job_type);
CREATE INDEX IF NOT EXISTS idx_job_templates_active ON job_completion_templates(is_active);

-- Create job_completions table
CREATE TABLE IF NOT EXISTS job_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE UNIQUE NOT NULL,
  technician_id uuid REFERENCES profiles(id) NOT NULL,
  template_id uuid REFERENCES job_completion_templates(id),
  checklist_data jsonb NOT NULL DEFAULT '{}',
  tech_notes text,
  customer_signature_url text,
  customer_name text,
  customer_email text,
  completed_at timestamptz DEFAULT now(),
  quality_score integer CHECK (quality_score >= 1 AND quality_score <= 5),
  flagged_for_review boolean DEFAULT false,
  review_notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_completions_work_order ON job_completions(work_order_id);
CREATE INDEX IF NOT EXISTS idx_job_completions_tech ON job_completions(technician_id);
CREATE INDEX IF NOT EXISTS idx_job_completions_flagged ON job_completions(flagged_for_review);
CREATE INDEX IF NOT EXISTS idx_job_completions_completed_at ON job_completions(completed_at);

-- Create parts_usage_log table
CREATE TABLE IF NOT EXISTS parts_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parts_request_id uuid REFERENCES parts_requests(id) ON DELETE SET NULL,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  inventory_item_id uuid,
  technician_id uuid REFERENCES profiles(id) NOT NULL,
  part_name text NOT NULL,
  quantity_used integer NOT NULL CHECK (quantity_used > 0),
  unit_cost decimal(10, 2) NOT NULL DEFAULT 0,
  total_cost decimal(10, 2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'truck_stock' CHECK (source IN ('truck_stock', 'warehouse', 'parts_request', 'customer_supplied')),
  used_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parts_usage_work_order ON parts_usage_log(work_order_id);
CREATE INDEX IF NOT EXISTS idx_parts_usage_tech ON parts_usage_log(technician_id);
CREATE INDEX IF NOT EXISTS idx_parts_usage_inventory ON parts_usage_log(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_parts_usage_request ON parts_usage_log(parts_request_id);
CREATE INDEX IF NOT EXISTS idx_parts_usage_used_at ON parts_usage_log(used_at);

-- Enable RLS
ALTER TABLE parts_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_completion_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts_usage_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for parts_requests
CREATE POLICY "Techs can create parts requests"
  ON parts_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = technician_id);

CREATE POLICY "Techs can view own parts requests"
  ON parts_requests FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'dispatch')
    )
  );

CREATE POLICY "Techs can update own parts requests"
  ON parts_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = technician_id)
  WITH CHECK (auth.uid() = technician_id);

CREATE POLICY "Admins can manage parts requests"
  ON parts_requests FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- RLS Policies for job_photos
CREATE POLICY "Techs can create job photos"
  ON job_photos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = technician_id);

CREATE POLICY "Staff can view job photos"
  ON job_photos FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'dispatch', 'sales')
    )
  );

CREATE POLICY "Techs can update own job photos"
  ON job_photos FOR UPDATE
  TO authenticated
  USING (auth.uid() = technician_id)
  WITH CHECK (auth.uid() = technician_id);

CREATE POLICY "Techs can delete own job photos"
  ON job_photos FOR DELETE
  TO authenticated
  USING (auth.uid() = technician_id);

-- RLS Policies for job_completion_templates
CREATE POLICY "Everyone can view active templates"
  ON job_completion_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage templates"
  ON job_completion_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for job_completions
CREATE POLICY "Techs can create job completions"
  ON job_completions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = technician_id);

CREATE POLICY "Techs can view own job completions"
  ON job_completions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'dispatch', 'sales')
    )
  );

CREATE POLICY "Admins can update job completions"
  ON job_completions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- RLS Policies for parts_usage_log
CREATE POLICY "Techs can create parts usage logs"
  ON parts_usage_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = technician_id);

CREATE POLICY "Everyone can view parts usage logs"
  ON parts_usage_log FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'dispatch')
    )
  );

-- Function to update parts_requests timestamp
CREATE OR REPLACE FUNCTION update_parts_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_parts_request_timestamp
  BEFORE UPDATE ON parts_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_parts_request_timestamp();

-- Function to log parts usage when request is marked as installed
CREATE OR REPLACE FUNCTION log_parts_usage_from_request()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'installed' AND OLD.status != 'installed' AND NEW.installed_at IS NOT NULL THEN
    INSERT INTO parts_usage_log (
      parts_request_id,
      work_order_id,
      technician_id,
      part_name,
      quantity_used,
      unit_cost,
      total_cost,
      source,
      used_at
    ) VALUES (
      NEW.id,
      NEW.work_order_id,
      NEW.technician_id,
      NEW.part_name,
      NEW.quantity,
      COALESCE(NEW.actual_cost, NEW.estimated_cost, 0) / NEW.quantity,
      COALESCE(NEW.actual_cost, NEW.estimated_cost, 0),
      'parts_request',
      NEW.installed_at
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_parts_usage_from_request
  AFTER UPDATE ON parts_requests
  FOR EACH ROW
  EXECUTE FUNCTION log_parts_usage_from_request();

-- Insert default job completion templates
INSERT INTO job_completion_templates (job_type, template_name, checklist_items, required_photos, requires_signature)
VALUES
  (
    'HVAC',
    'HVAC Installation/Repair Checklist',
    '[
      {"id": 1, "item": "System tested and operating correctly", "required": true},
      {"id": 2, "item": "Filters replaced or cleaned", "required": true},
      {"id": 3, "item": "Thermostat calibrated and programmed", "required": true},
      {"id": 4, "item": "Refrigerant levels checked", "required": true},
      {"id": 5, "item": "Ductwork inspected for leaks", "required": false},
      {"id": 6, "item": "Customer trained on system operation", "required": true},
      {"id": 7, "item": "Work area cleaned and debris removed", "required": true}
    ]'::jsonb,
    '["before", "after"]'::jsonb,
    true
  ),
  (
    'Electrical',
    'Electrical Service Checklist',
    '[
      {"id": 1, "item": "Circuit breakers labeled correctly", "required": true},
      {"id": 2, "item": "All connections tight and secure", "required": true},
      {"id": 3, "item": "GFCI outlets tested", "required": true},
      {"id": 4, "item": "Voltage readings documented", "required": true},
      {"id": 5, "item": "No exposed wiring", "required": true},
      {"id": 6, "item": "Customer shown breaker panel", "required": true},
      {"id": 7, "item": "Safety warnings provided", "required": true}
    ]'::jsonb,
    '["before", "after", "issue"]'::jsonb,
    true
  ),
  (
    'Plumbing',
    'Plumbing Service Checklist',
    '[
      {"id": 1, "item": "No leaks detected", "required": true},
      {"id": 2, "item": "Water pressure tested", "required": true},
      {"id": 3, "item": "Drainage tested", "required": true},
      {"id": 4, "item": "Shut-off valves accessible and working", "required": true},
      {"id": 5, "item": "Customer shown shut-off locations", "required": true},
      {"id": 6, "item": "Area cleaned and dried", "required": true}
    ]'::jsonb,
    '["before", "after"]'::jsonb,
    true
  ),
  (
    'General',
    'General Service Checklist',
    '[
      {"id": 1, "item": "Work completed as described", "required": true},
      {"id": 2, "item": "Equipment tested and functioning", "required": true},
      {"id": 3, "item": "Customer questions answered", "required": true},
      {"id": 4, "item": "Work area cleaned", "required": true}
    ]'::jsonb,
    '["before", "after"]'::jsonb,
    true
  )
ON CONFLICT DO NOTHING;
