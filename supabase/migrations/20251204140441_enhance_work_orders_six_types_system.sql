/*
  # Enhance Work Orders with 6-Type System
  
  ## Summary
  Implements comprehensive work order type system with 6 distinct types:
  - Project: Installation work linked to projects/sales orders (not directly billable)
  - Service: Billable time & materials service work
  - Site Survey: Non-billable site assessment before work
  - Warranty: Non-billable warranty work with reference tracking
  - Punchlist: From punchlist feature (can be billable or warranty)
  - VIP Program: Pre-scheduled VIP plan service appointments
  
  ## Schema Changes
  
  ### work_orders table modifications:
  - Update `type` constraint to support 6 new work order types
  - Add `warranty_reference_type` - Type of work this warranty covers (project/service)
  - Add `warranty_reference_id` - Link to original project or service work order
  - Add `recurring_subscription_id` - Link to VIP subscription for VIP program work orders
  - Add `appointment_id` - Link to scheduled appointment
  - Add `send_appointment_reminder` - Whether to send reminders
  - Add `reminder_email` - Send email reminder flag
  - Add `reminder_sms` - Send SMS reminder flag
  - Add `default_job_description` - For VIP program work orders (from plan)
  - Add `customer_sales_rep_id` - Cache of contact's assigned_to for quick reference
  
  ## New Constraints
  - Warranty work orders must have warranty_reference_id
  - VIP work orders must have recurring_subscription_id
  - Project work orders must have project_id
  
  ## Indexes
  - Index on warranty_reference_id for quick warranty lookup
  - Index on recurring_subscription_id for VIP work order queries
  - Index on appointment_id for appointment-based queries
  - Index on customer_sales_rep_id for sales rep filtering
  
  ## Security
  - Maintains existing RLS policies
  - All new columns respect existing access controls
  
  ## Notes
  - This migration is backward compatible - existing work orders will maintain their current type
  - Service billing queue will need to be updated to filter by these new types
  - Parts can be added to any work order via service_parts_used table
  - Tasks can reference work orders for follow-up actions
*/

-- Add new columns to work_orders
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS warranty_reference_type text CHECK (warranty_reference_type IN ('project', 'service')),
  ADD COLUMN IF NOT EXISTS warranty_reference_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurring_subscription_id uuid REFERENCES recurring_subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_appointment_reminder boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_sms boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_job_description text,
  ADD COLUMN IF NOT EXISTS customer_sales_rep_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Update the work order type constraint to support 6 types
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS valid_wo_type;
ALTER TABLE work_orders ADD CONSTRAINT valid_wo_type 
  CHECK (type IN ('project', 'service', 'site_survey', 'warranty', 'punchlist', 'vip_program'));

-- Add constraint: warranty work orders must have warranty_reference_id
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS warranty_requires_reference;
ALTER TABLE work_orders ADD CONSTRAINT warranty_requires_reference
  CHECK (
    (type = 'warranty' AND warranty_reference_id IS NOT NULL)
    OR type != 'warranty'
  );

-- Add constraint: VIP work orders must have recurring_subscription_id
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS vip_requires_subscription;
ALTER TABLE work_orders ADD CONSTRAINT vip_requires_subscription
  CHECK (
    (type = 'vip_program' AND recurring_subscription_id IS NOT NULL)
    OR type != 'vip_program'
  );

-- Add constraint: Project work orders should have project_id
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS project_type_requires_project_id;
ALTER TABLE work_orders ADD CONSTRAINT project_type_requires_project_id
  CHECK (
    (type = 'project' AND project_id IS NOT NULL)
    OR type != 'project'
  );

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_work_orders_warranty_ref ON work_orders(warranty_reference_id) WHERE warranty_reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_recurring_sub ON work_orders(recurring_subscription_id) WHERE recurring_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_appointment ON work_orders(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_sales_rep ON work_orders(customer_sales_rep_id) WHERE customer_sales_rep_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_type ON work_orders(type);
CREATE INDEX IF NOT EXISTS idx_work_orders_reminders ON work_orders(send_appointment_reminder, start_date) WHERE send_appointment_reminder = true;

-- Add comments for documentation
COMMENT ON COLUMN work_orders.type IS 'Work order type: project (linked to project/sales order), service (billable T&M), site_survey (non-billable assessment), warranty (non-billable warranty work), punchlist (from punchlist feature), vip_program (pre-scheduled VIP service)';
COMMENT ON COLUMN work_orders.warranty_reference_type IS 'Type of work this warranty covers: project or service';
COMMENT ON COLUMN work_orders.warranty_reference_id IS 'Link to original project or service work order that this warranty covers';
COMMENT ON COLUMN work_orders.recurring_subscription_id IS 'Link to VIP subscription for VIP program work orders';
COMMENT ON COLUMN work_orders.appointment_id IS 'Link to scheduled appointment';
COMMENT ON COLUMN work_orders.send_appointment_reminder IS 'Whether to send automated appointment reminders to customer';
COMMENT ON COLUMN work_orders.reminder_email IS 'Send email appointment reminder';
COMMENT ON COLUMN work_orders.reminder_sms IS 'Send SMS appointment reminder';
COMMENT ON COLUMN work_orders.default_job_description IS 'Default job description from VIP plan or template';
COMMENT ON COLUMN work_orders.customer_sales_rep_id IS 'Cached reference to customer assigned sales rep for quick filtering';

-- Function to auto-populate customer_sales_rep_id from contact
CREATE OR REPLACE FUNCTION set_work_order_sales_rep()
RETURNS TRIGGER AS $$
BEGIN
  -- If contact_id is set and customer_sales_rep_id is not set, populate it
  IF NEW.contact_id IS NOT NULL AND NEW.customer_sales_rep_id IS NULL THEN
    SELECT assigned_to INTO NEW.customer_sales_rep_id
    FROM contacts
    WHERE id = NEW.contact_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-populate customer_sales_rep_id
DROP TRIGGER IF EXISTS set_work_order_sales_rep_trigger ON work_orders;
CREATE TRIGGER set_work_order_sales_rep_trigger
  BEFORE INSERT OR UPDATE OF contact_id ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_work_order_sales_rep();

-- Update existing work orders to populate customer_sales_rep_id
UPDATE work_orders wo
SET customer_sales_rep_id = c.assigned_to
FROM contacts c
WHERE wo.contact_id = c.id
  AND wo.customer_sales_rep_id IS NULL
  AND c.assigned_to IS NOT NULL;

-- Update billable_type for different work order types (migration helper)
-- Set non-billable types appropriately
UPDATE work_orders 
SET billable_type = 'project'
WHERE type = 'project' AND billable_type IS NULL;

UPDATE work_orders 
SET billable_type = 'warranty'
WHERE type = 'warranty' AND billable_type IS NULL;
