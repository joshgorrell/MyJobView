/*
  # Service Request and Billing System

  1. New Tables
    - `service_requests` - Fast mobile-first service request creation
    - `service_billing_queue` - Billing task management with escalation
    - `service_labor_entries` - Labor tracking from tech clock-ins
    - `service_parts_used` - Parts tracking for billing
    - `service_additional_charges` - Trip fees, diagnostics, discounts
    
  2. Additions to work_orders
    - Add service-specific fields for billable type and location
    
  3. Security
    - Enable RLS on all tables
    - Role-based policies for sales, dispatch, admin, techs
    
  4. Workflow
    - Service request → Auto-converts to work order
    - Work order → Routes to dispatch unscheduled queue
    - Job completion → Creates billing queue entry
    - Billing → Assigned based on "billable_by" field
    - Escalation → 48h to dispatch, 72h to admin
*/

-- Add service-specific fields to work_orders if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'contact_id') THEN
    ALTER TABLE work_orders ADD COLUMN contact_id uuid REFERENCES contacts(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'billable_type') THEN
    ALTER TABLE work_orders ADD COLUMN billable_type text CHECK (billable_type IN ('billable', 'warranty', 'project'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'service_location_address') THEN
    ALTER TABLE work_orders ADD COLUMN service_location_address text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'service_location_city') THEN
    ALTER TABLE work_orders ADD COLUMN service_location_city text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'service_location_state') THEN
    ALTER TABLE work_orders ADD COLUMN service_location_state text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'service_location_zip') THEN
    ALTER TABLE work_orders ADD COLUMN service_location_zip text;
  END IF;
END $$;

-- Service Requests Table
CREATE TABLE IF NOT EXISTS service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Creator info
  created_by uuid REFERENCES profiles(id),
  
  -- Customer info
  contact_id uuid REFERENCES contacts(id),
  customer_name text NOT NULL,
  customer_phone text,
  customer_email text,
  
  -- Location
  job_location_address text NOT NULL,
  job_location_city text,
  job_location_state text,
  job_location_zip text,
  
  -- Job details
  job_description text NOT NULL,
  
  -- Billable info
  billable_type text NOT NULL CHECK (billable_type IN ('billable', 'warranty')),
  billable_by text NOT NULL CHECK (billable_by IN ('admin', 'dispatch', 'assigned_sales_rep', 'other_sales_rep')),
  billable_by_user_id uuid REFERENCES profiles(id),
  
  -- Priority
  priority text DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent', 'emergency')),
  
  -- Optional fields
  requested_tech_ids text[],
  estimated_duration text,
  requested_date timestamptz,
  requested_time text,
  
  -- Status tracking
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'converted_to_work_order', 'cancelled')),
  work_order_id uuid REFERENCES work_orders(id),
  
  -- Metadata
  attachments jsonb DEFAULT '[]'::jsonb,
  notes text,
  offline_created boolean DEFAULT false,
  synced_at timestamptz
);

-- Service Billing Queue Table
CREATE TABLE IF NOT EXISTS service_billing_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Links
  work_order_id uuid REFERENCES work_orders(id) NOT NULL,
  service_request_id uuid REFERENCES service_requests(id),
  contact_id uuid REFERENCES contacts(id),
  
  -- Assignment
  billable_by text NOT NULL CHECK (billable_by IN ('admin', 'dispatch', 'assigned_sales_rep', 'other_sales_rep')),
  assigned_to_user_id uuid REFERENCES profiles(id),
  assigned_at timestamptz,
  
  -- Escalation tracking
  escalation_level int DEFAULT 0,
  escalated_to_dispatch_at timestamptz,
  escalated_to_admin_at timestamptz,
  
  -- Status
  status text DEFAULT 'ready_for_billing' CHECK (status IN (
    'ready_for_billing',
    'assigned',
    'in_progress',
    'invoice_created',
    'invoice_sent',
    'payment_pending',
    'paid',
    'overdue',
    'closed'
  )),
  
  -- Invoice tracking
  invoice_id uuid REFERENCES invoices(id),
  qbo_invoice_id text,
  
  -- Timing
  completed_at timestamptz,
  billing_deadline timestamptz,
  invoiced_at timestamptz,
  paid_at timestamptz,
  
  -- Metadata
  notes text,
  escalation_notes text
);

-- Service Labor Entries Table
CREATE TABLE IF NOT EXISTS service_labor_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Links
  work_order_id uuid REFERENCES work_orders(id) NOT NULL,
  service_billing_queue_id uuid REFERENCES service_billing_queue(id),
  tech_user_id uuid REFERENCES profiles(id) NOT NULL,
  
  -- Labor calculation
  clock_in_time timestamptz,
  clock_out_time timestamptz,
  calculated_hours decimal NOT NULL,
  
  -- Billing
  labor_rate decimal DEFAULT 0,
  labor_total decimal GENERATED ALWAYS AS (calculated_hours * labor_rate) STORED,
  is_warranty boolean DEFAULT false,
  is_billable boolean DEFAULT true,
  
  -- Overrides
  override_hours decimal,
  override_rate decimal,
  override_total decimal,
  override_reason text,
  overridden_by uuid REFERENCES profiles(id),
  overridden_at timestamptz,
  
  -- Metadata
  notes text
);

-- Service Parts Used Table
CREATE TABLE IF NOT EXISTS service_parts_used (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Links
  work_order_id uuid REFERENCES work_orders(id) NOT NULL,
  service_billing_queue_id uuid REFERENCES service_billing_queue(id),
  product_id uuid REFERENCES products(id),
  
  -- Part details
  part_name text NOT NULL,
  part_sku text,
  quantity decimal NOT NULL DEFAULT 1,
  
  -- Pricing
  unit_cost decimal DEFAULT 0,
  unit_price decimal DEFAULT 0,
  total_price decimal GENERATED ALWAYS AS (quantity * unit_price) STORED,
  
  -- Warranty
  is_warranty boolean DEFAULT false,
  warranty_covered boolean DEFAULT false,
  
  -- Overrides
  override_price decimal,
  override_reason text,
  overridden_by uuid REFERENCES profiles(id),
  overridden_at timestamptz,
  
  -- Metadata
  notes text
);

-- Service Additional Charges Table
CREATE TABLE IF NOT EXISTS service_additional_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Links
  service_billing_queue_id uuid REFERENCES service_billing_queue(id) NOT NULL,
  
  -- Charge details
  charge_type text NOT NULL CHECK (charge_type IN (
    'trip_fee',
    'diagnostic_fee',
    'custom',
    'discount',
    'coupon'
  )),
  description text NOT NULL,
  amount decimal NOT NULL,
  is_discount boolean DEFAULT false,
  
  -- Metadata
  notes text,
  added_by uuid REFERENCES profiles(id),
  coupon_code text
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_service_requests_contact ON service_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_created_by ON service_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_service_requests_billable_by_user ON service_requests(billable_by_user_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_work_order ON service_requests(work_order_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_created_at ON service_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_service_billing_queue_work_order ON service_billing_queue(work_order_id);
CREATE INDEX IF NOT EXISTS idx_service_billing_queue_assigned_to ON service_billing_queue(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_service_billing_queue_status ON service_billing_queue(status);
CREATE INDEX IF NOT EXISTS idx_service_billing_queue_invoice ON service_billing_queue(invoice_id);
CREATE INDEX IF NOT EXISTS idx_service_billing_queue_deadline ON service_billing_queue(billing_deadline);

CREATE INDEX IF NOT EXISTS idx_service_labor_work_order ON service_labor_entries(work_order_id);
CREATE INDEX IF NOT EXISTS idx_service_labor_tech ON service_labor_entries(tech_user_id);
CREATE INDEX IF NOT EXISTS idx_service_labor_billing_queue ON service_labor_entries(service_billing_queue_id);

CREATE INDEX IF NOT EXISTS idx_service_parts_work_order ON service_parts_used(work_order_id);
CREATE INDEX IF NOT EXISTS idx_service_parts_product ON service_parts_used(product_id);
CREATE INDEX IF NOT EXISTS idx_service_parts_billing_queue ON service_parts_used(service_billing_queue_id);

CREATE INDEX IF NOT EXISTS idx_service_charges_billing_queue ON service_additional_charges(service_billing_queue_id);

-- Enable Row Level Security
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_billing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_labor_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_parts_used ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_additional_charges ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service_requests
CREATE POLICY "Anyone authenticated can create service requests"
  ON service_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view relevant service requests"
  ON service_requests FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by
    OR auth.uid() = billable_by_user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager', 'sales_manager')
    )
  );

CREATE POLICY "Creators and managers can update service requests"
  ON service_requests FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager')
    )
  );

-- RLS Policies for service_billing_queue
CREATE POLICY "View billing queue if assigned or manager"
  ON service_billing_queue FOR SELECT
  TO authenticated
  USING (
    auth.uid() = assigned_to_user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager', 'sales_manager')
    )
  );

CREATE POLICY "Managers can create billing queue entries"
  ON service_billing_queue FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager')
    )
  );

CREATE POLICY "Assigned users and managers can update billing queue"
  ON service_billing_queue FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = assigned_to_user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager')
    )
  );

-- RLS Policies for service_labor_entries
CREATE POLICY "View labor if tech, biller, or manager"
  ON service_labor_entries FOR SELECT
  TO authenticated
  USING (
    auth.uid() = tech_user_id
    OR EXISTS (
      SELECT 1 FROM service_billing_queue
      WHERE service_billing_queue.id = service_labor_entries.service_billing_queue_id
      AND service_billing_queue.assigned_to_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager')
    )
  );

CREATE POLICY "Techs and managers can create labor entries"
  ON service_labor_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = tech_user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager')
    )
  );

CREATE POLICY "Managers can update labor entries"
  ON service_labor_entries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager')
    )
  );

-- RLS Policies for service_parts_used
CREATE POLICY "View parts if related to job or manager"
  ON service_parts_used FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_billing_queue
      WHERE service_billing_queue.id = service_parts_used.service_billing_queue_id
      AND service_billing_queue.assigned_to_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM work_orders
      WHERE work_orders.id = service_parts_used.work_order_id
      AND work_orders.assigned_to = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager', 'inventory_manager', 'technician', 'field_tech')
    )
  );

CREATE POLICY "Techs and managers can add parts"
  ON service_parts_used FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager', 'technician', 'field_tech')
    )
  );

CREATE POLICY "Billers and managers can update parts"
  ON service_parts_used FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_billing_queue
      WHERE service_billing_queue.id = service_parts_used.service_billing_queue_id
      AND service_billing_queue.assigned_to_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager')
    )
  );

-- RLS Policies for service_additional_charges
CREATE POLICY "View charges if assigned or manager"
  ON service_additional_charges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_billing_queue
      WHERE service_billing_queue.id = service_additional_charges.service_billing_queue_id
      AND service_billing_queue.assigned_to_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager')
    )
  );

CREATE POLICY "Billers and managers can add charges"
  ON service_additional_charges FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_billing_queue
      WHERE service_billing_queue.id = service_additional_charges.service_billing_queue_id
      AND service_billing_queue.assigned_to_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager')
    )
  );

CREATE POLICY "Billers and managers can update charges"
  ON service_additional_charges FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_billing_queue
      WHERE service_billing_queue.id = service_additional_charges.service_billing_queue_id
      AND service_billing_queue.assigned_to_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatch', 'production_manager')
    )
  );

-- Function to auto-convert service request to work order
CREATE OR REPLACE FUNCTION convert_service_request_to_work_order()
RETURNS TRIGGER AS $$
DECLARE
  new_work_order_id uuid;
BEGIN
  -- Only process if status is pending and no work order exists yet
  IF NEW.status = 'pending' AND NEW.work_order_id IS NULL THEN
    -- Create work order
    INSERT INTO work_orders (
      contact_id,
      description,
      status,
      priority,
      service_location_address,
      service_location_city,
      service_location_state,
      service_location_zip,
      billable_type,
      created_by
    ) VALUES (
      NEW.contact_id,
      NEW.job_description,
      'unscheduled',
      NEW.priority,
      NEW.job_location_address,
      NEW.job_location_city,
      NEW.job_location_state,
      NEW.job_location_zip,
      NEW.billable_type,
      NEW.created_by
    )
    RETURNING id INTO new_work_order_id;
    
    -- Update service request with work order link
    NEW.work_order_id = new_work_order_id;
    NEW.status = 'converted_to_work_order';
    
    -- Create activity feed entry
    INSERT INTO activity_feed (type, user_id, metadata)
    VALUES (
      'service_request_created',
      NEW.created_by,
      jsonb_build_object(
        'service_request_id', NEW.id,
        'work_order_id', new_work_order_id,
        'customer_name', NEW.customer_name,
        'billable_by', NEW.billable_by
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-convert service requests
DROP TRIGGER IF EXISTS auto_convert_service_request_to_work_order ON service_requests;
CREATE TRIGGER auto_convert_service_request_to_work_order
  BEFORE INSERT ON service_requests
  FOR EACH ROW
  EXECUTE FUNCTION convert_service_request_to_work_order();
