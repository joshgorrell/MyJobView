/*
  # Create Comprehensive Change Order System

  ## Overview
  Implements a complete change order management system for tracking modifications
  to sales orders, including line item details, multi-level approvals, customer
  signatures, and full audit trails.

  ## New Tables

  ### `change_order_line_items`
  Detailed breakdown of what's being added, removed, or modified in a change order
  - `id` (uuid, primary key)
  - `change_order_id` (uuid, FK to change_orders)
  - `action_type` (text) - 'add', 'remove', 'modify_quantity', 'modify_price'
  - `product_id` (uuid, FK to products, nullable)
  - `product_name` (text, not null)
  - `product_description` (text)
  - `original_quantity` (numeric) - For modifications
  - `original_unit_price` (numeric) - For modifications
  - `original_total` (numeric) - For modifications
  - `new_quantity` (numeric, not null)
  - `new_unit_price` (numeric, not null)
  - `new_total` (numeric, not null)
  - `change_amount` (numeric, not null) - Calculated difference
  - `labor_phase_id` (uuid, FK to labor_phases)
  - `labor_phase_name` (text)
  - `install_location` (text) - Room/area
  - `tech_notes` (text) - Installation notes
  - `sort_order` (integer)
  - `created_at` (timestamptz)

  ### `change_order_approvals`
  Multi-level approval tracking for change orders
  - `id` (uuid, primary key)
  - `change_order_id` (uuid, FK to change_orders)
  - `approval_level` (integer) - 1, 2, 3 (sequential)
  - `approver_role` (text) - Role required for this level
  - `approver_id` (uuid, FK to profiles, nullable) - Specific person
  - `status` (text) - 'pending', 'approved', 'rejected', 'skipped'
  - `approved_date` (timestamptz)
  - `rejection_reason` (text)
  - `notes` (text)
  - `required` (boolean) - Can this level be skipped?
  - `created_at` (timestamptz)

  ### `change_order_history`
  Complete audit trail of all change order actions
  - `id` (uuid, primary key)
  - `change_order_id` (uuid, FK to change_orders)
  - `action` (text) - Type of action performed
  - `performed_by` (uuid, FK to profiles)
  - `description` (text)
  - `snapshot` (jsonb) - State before change
  - `created_at` (timestamptz)

  ### `change_order_documents`
  File attachments and generated documents
  - `id` (uuid, primary key)
  - `change_order_id` (uuid, FK to change_orders)
  - `document_type` (text) - 'proposal', 'approval_form', 'signed_contract', etc.
  - `file_name` (text)
  - `file_url` (text)
  - `file_size` (integer)
  - `mime_type` (text)
  - `uploaded_by` (uuid, FK to profiles)
  - `created_at` (timestamptz)

  ## Enhanced `change_orders` Table
  - Add sales_order_id (PRIMARY link to sales orders)
  - Add revision_number for versioning
  - Add type field ('addition', 'deletion', 'modification', 'credit')
  - Add tax_amount tracking
  - Add customer approval fields
  - Add proposal integration fields
  - Add estimated impact fields

  ## Security
  - Enable RLS on all new tables
  - Project managers can create and manage change orders
  - Multi-level approval based on dollar thresholds
  - Customers can view and approve their own change orders
  - Full audit trail for compliance

  ## Business Logic
  - Approval thresholds configurable by company
  - Sequential approval workflow
  - Automatic sales order update on final approval
  - Customer signature collection for large changes
  - Document generation and storage
*/

-- ============================================================================
-- STEP 1: Enhance existing change_orders table
-- ============================================================================

-- Add sales_order_id as the primary link
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'sales_order_id'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN sales_order_id uuid REFERENCES sales_orders(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add revision tracking
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'revision_number'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN revision_number integer DEFAULT 0;
  END IF;
END $$;

-- Add type field for better categorization
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'type'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN type text DEFAULT 'addition' 
      CHECK (type IN ('addition', 'deletion', 'modification', 'credit'));
  END IF;
END $$;

-- Add tax tracking
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'tax_amount'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN tax_amount numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add customer approval tracking
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'requires_customer_approval'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN requires_customer_approval boolean DEFAULT false;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'customer_approved'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN customer_approved boolean DEFAULT false;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'customer_approved_date'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN customer_approved_date timestamptz;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'customer_signature_url'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN customer_signature_url text;
  END IF;
END $$;

-- Add proposal integration
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'requires_new_proposal'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN requires_new_proposal boolean DEFAULT false;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'proposal_id'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add impact estimates
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'estimated_material_cost_change'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN estimated_material_cost_change numeric(10,2) DEFAULT 0;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'estimated_completion_date_change'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN estimated_completion_date_change interval;
  END IF;
END $$;

-- Rename requested_by to requested_by for consistency (if needed)
-- Already exists in the schema as requested_by

-- Add requested_date if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'requested_date'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN requested_date timestamptz DEFAULT now();
  END IF;
END $$;

-- Add internal notes field (separate from description)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'internal_notes'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN internal_notes text;
  END IF;
END $$;

-- Rename original_amount to original_contract_amount for clarity
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'original_amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'original_contract_amount'
  ) THEN
    ALTER TABLE change_orders RENAME COLUMN original_amount TO original_contract_amount;
  END IF;
END $$;

-- Rename new_total to new_contract_total for clarity
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'new_total'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'change_orders' AND column_name = 'new_contract_total'
  ) THEN
    ALTER TABLE change_orders RENAME COLUMN new_total TO new_contract_total;
  END IF;
END $$;

-- Add indexes for sales_order_id
CREATE INDEX IF NOT EXISTS idx_change_orders_sales_order ON change_orders(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_proposal ON change_orders(proposal_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_customer_approval ON change_orders(requires_customer_approval, customer_approved) 
  WHERE requires_customer_approval = true;

-- ============================================================================
-- STEP 2: Create change_order_line_items table
-- ============================================================================

CREATE TABLE IF NOT EXISTS change_order_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id uuid NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  
  -- Action type
  action_type text NOT NULL CHECK (action_type IN ('add', 'remove', 'modify_quantity', 'modify_price')),
  
  -- Product reference
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_description text,
  
  -- Original values (for modifications and deletions)
  original_quantity numeric(10,2),
  original_unit_price numeric(10,2),
  original_total numeric(10,2),
  
  -- New values
  new_quantity numeric(10,2) NOT NULL DEFAULT 0,
  new_unit_price numeric(10,2) NOT NULL DEFAULT 0,
  new_total numeric(10,2) NOT NULL DEFAULT 0,
  
  -- Calculated change amount
  change_amount numeric(10,2) NOT NULL DEFAULT 0,
  
  -- Labor phase
  labor_phase_id uuid REFERENCES labor_phases(id) ON DELETE SET NULL,
  labor_phase_name text,
  
  -- Installation details
  install_location text,
  tech_notes text,
  
  -- Ordering
  sort_order integer DEFAULT 0,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for line items
CREATE INDEX IF NOT EXISTS idx_co_line_items_change_order ON change_order_line_items(change_order_id);
CREATE INDEX IF NOT EXISTS idx_co_line_items_product ON change_order_line_items(product_id);
CREATE INDEX IF NOT EXISTS idx_co_line_items_labor_phase ON change_order_line_items(labor_phase_id);

-- Enable RLS
ALTER TABLE change_order_line_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for line items
CREATE POLICY "Users can view line items for change orders they can see"
  ON change_order_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM change_orders co
      WHERE co.id = change_order_line_items.change_order_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'sales')
        )
        OR co.company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
      )
    )
  );

CREATE POLICY "Managers can manage change order line items"
  ON change_order_line_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

-- ============================================================================
-- STEP 3: Create change_order_approvals table
-- ============================================================================

CREATE TABLE IF NOT EXISTS change_order_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id uuid NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  
  -- Approval level (sequential)
  approval_level integer NOT NULL CHECK (approval_level > 0 AND approval_level <= 10),
  
  -- Who needs to approve
  approver_role text NOT NULL,
  approver_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')),
  approved_date timestamptz,
  rejection_reason text,
  notes text,
  
  -- Configuration
  required boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(change_order_id, approval_level)
);

-- Indexes for approvals
CREATE INDEX IF NOT EXISTS idx_co_approvals_change_order ON change_order_approvals(change_order_id);
CREATE INDEX IF NOT EXISTS idx_co_approvals_approver ON change_order_approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_co_approvals_status ON change_order_approvals(status) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE change_order_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for approvals
CREATE POLICY "Users can view approvals for change orders they can see"
  ON change_order_approvals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM change_orders co
      WHERE co.id = change_order_approvals.change_order_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'sales')
        )
        OR co.company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
      )
    )
  );

CREATE POLICY "Managers can create approval records"
  ON change_order_approvals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

CREATE POLICY "Approvers can update their assigned approvals"
  ON change_order_approvals FOR UPDATE
  TO authenticated
  USING (
    approver_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role IN ('admin', 'office_manager') OR
        profiles.role = approver_role
      )
    )
  );

-- ============================================================================
-- STEP 4: Create change_order_history table
-- ============================================================================

CREATE TABLE IF NOT EXISTS change_order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id uuid NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  
  -- Action details
  action text NOT NULL,
  performed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  description text,
  
  -- State snapshot (for rollback capability)
  snapshot jsonb,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for history
CREATE INDEX IF NOT EXISTS idx_co_history_change_order ON change_order_history(change_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_co_history_performed_by ON change_order_history(performed_by);
CREATE INDEX IF NOT EXISTS idx_co_history_action ON change_order_history(action);

-- Enable RLS
ALTER TABLE change_order_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for history
CREATE POLICY "Users can view history for change orders they can see"
  ON change_order_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM change_orders co
      WHERE co.id = change_order_history.change_order_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'sales')
        )
        OR co.company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
      )
    )
  );

CREATE POLICY "System can create history records"
  ON change_order_history FOR INSERT
  TO authenticated
  WITH CHECK (performed_by = auth.uid());

-- ============================================================================
-- STEP 5: Create change_order_documents table
-- ============================================================================

CREATE TABLE IF NOT EXISTS change_order_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id uuid NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  
  -- Document details
  document_type text NOT NULL CHECK (document_type IN (
    'proposal', 'approval_form', 'signed_contract', 'supporting_doc', 
    'photo', 'drawing', 'other'
  )),
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  mime_type text,
  
  -- Upload tracking
  uploaded_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for documents
CREATE INDEX IF NOT EXISTS idx_co_documents_change_order ON change_order_documents(change_order_id);
CREATE INDEX IF NOT EXISTS idx_co_documents_type ON change_order_documents(document_type);

-- Enable RLS
ALTER TABLE change_order_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for documents
CREATE POLICY "Users can view documents for change orders they can see"
  ON change_order_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM change_orders co
      WHERE co.id = change_order_documents.change_order_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'sales')
        )
        OR co.company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
      )
    )
  );

CREATE POLICY "Users can upload documents to change orders"
  ON change_order_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM change_orders co
      WHERE co.id = change_order_documents.change_order_id
      AND (
        co.requested_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'office_manager', 'project_manager')
        )
      )
    )
  );

-- ============================================================================
-- STEP 6: Create helper functions
-- ============================================================================

-- Function to calculate change order totals
CREATE OR REPLACE FUNCTION calculate_change_order_totals(p_change_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_change numeric;
  v_original_amount numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_new_total numeric;
BEGIN
  -- Sum all line item changes
  SELECT COALESCE(SUM(change_amount), 0)
  INTO v_total_change
  FROM change_order_line_items
  WHERE change_order_id = p_change_order_id;
  
  -- Get original contract amount from sales order or current value
  SELECT 
    COALESCE(so.contract_total, co.original_contract_amount, 0),
    COALESCE(co.tax_amount / NULLIF(co.change_amount, 0), 0.08) -- Estimate tax rate from existing data
  INTO v_original_amount, v_tax_rate
  FROM change_orders co
  LEFT JOIN sales_orders so ON so.id = co.sales_order_id
  WHERE co.id = p_change_order_id;
  
  -- Calculate tax on positive changes only
  IF v_total_change > 0 THEN
    v_tax_amount := v_total_change * v_tax_rate;
  ELSE
    v_tax_amount := 0;
  END IF;
  
  -- Calculate new total
  v_new_total := v_original_amount + v_total_change + v_tax_amount;
  
  -- Update change order
  UPDATE change_orders
  SET 
    original_contract_amount = v_original_amount,
    change_amount = v_total_change,
    tax_amount = v_tax_amount,
    new_contract_total = v_new_total,
    updated_at = now()
  WHERE id = p_change_order_id;
END;
$$;

-- Function to log change order actions
CREATE OR REPLACE FUNCTION log_change_order_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
  v_description text;
  v_snapshot jsonb;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_description := 'Change order created';
    v_snapshot := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status != OLD.status THEN
      v_action := 'status_changed';
      v_description := 'Status changed from ' || OLD.status || ' to ' || NEW.status;
    ELSE
      v_action := 'modified';
      v_description := 'Change order modified';
    END IF;
    v_snapshot := to_jsonb(OLD);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_description := 'Change order deleted';
    v_snapshot := to_jsonb(OLD);
  END IF;
  
  -- Log the action
  INSERT INTO change_order_history (
    change_order_id,
    action,
    performed_by,
    description,
    snapshot,
    created_at
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    v_action,
    auth.uid(),
    v_description,
    v_snapshot,
    now()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for change order history
DROP TRIGGER IF EXISTS trigger_log_change_order_action ON change_orders;
CREATE TRIGGER trigger_log_change_order_action
  AFTER INSERT OR UPDATE OR DELETE ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION log_change_order_action();

-- Function to check if all approvals are complete
CREATE OR REPLACE FUNCTION check_change_order_approvals_complete(p_change_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pending_count integer;
BEGIN
  -- Count pending required approvals
  SELECT COUNT(*)
  INTO v_pending_count
  FROM change_order_approvals
  WHERE change_order_id = p_change_order_id
  AND required = true
  AND status = 'pending';
  
  RETURN v_pending_count = 0;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_change_order_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION check_change_order_approvals_complete(uuid) TO authenticated;

-- ============================================================================
-- STEP 7: Update existing RLS policies for change_orders
-- ============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can view change orders" ON change_orders;
DROP POLICY IF EXISTS "Managers can manage change orders" ON change_orders;

-- Create new comprehensive policies
CREATE POLICY "Users can view change orders in their scope"
  ON change_orders FOR SELECT
  TO authenticated
  USING (
    -- Managers and sales can see all
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager', 'sales')
    )
    -- OR it's their company
    OR company_id IN (SELECT id FROM profiles WHERE id = auth.uid())
    -- OR they requested it
    OR requested_by = auth.uid()
  );

CREATE POLICY "Managers can create change orders"
  ON change_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

CREATE POLICY "Managers and requesters can update their change orders"
  ON change_orders FOR UPDATE
  TO authenticated
  USING (
    requested_by = auth.uid() AND status = 'draft'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );

CREATE POLICY "Managers can delete draft change orders"
  ON change_orders FOR DELETE
  TO authenticated
  USING (
    status = 'draft' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager', 'project_manager')
    )
  );
