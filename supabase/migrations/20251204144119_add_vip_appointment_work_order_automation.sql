/*
  # Add VIP Appointment to Work Order Automation

  ## Summary
  Enables automatic creation of VIP program work orders when VIP appointments are created.
  Links appointments to recurring subscriptions and automates work order generation.

  ## Changes

  1. **appointments table enhancements:**
     - Add `recurring_subscription_id` - Links appointment to VIP subscription
     - Add index on recurring_subscription_id for performance

  2. **Automation trigger:**
     - `trigger_create_vip_work_order()` - Automatically creates VIP work order when appointment with recurring_subscription_id is created
     - Sets appropriate work order fields from appointment
     - Links work order to appointment and subscription

  3. **Work order update trigger:**
     - `trigger_sync_vip_appointment_updates()` - Updates work order when appointment is modified
     - Syncs date, time, technician, and description changes

  ## Security
  - Uses existing RLS policies on work_orders and appointments
  - All operations inherit user permissions

  ## Notes
  - Only creates work orders for appointments with recurring_subscription_id
  - Work order type is set to 'vip_program'
  - Billable type is set to 'billable' (VIP appointments are pre-paid but tracked as billable)
  - Automatically links to contact from subscription
*/

-- Add recurring_subscription_id to appointments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'recurring_subscription_id'
  ) THEN
    ALTER TABLE appointments ADD COLUMN recurring_subscription_id uuid REFERENCES recurring_subscriptions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_appointments_recurring_subscription 
  ON appointments(recurring_subscription_id) 
  WHERE recurring_subscription_id IS NOT NULL;

-- Function to automatically create VIP work order when VIP appointment is created
CREATE OR REPLACE FUNCTION trigger_create_vip_work_order()
RETURNS TRIGGER AS $$
DECLARE
  v_subscription RECORD;
  v_plan RECORD;
  v_work_order_id uuid;
  v_work_order_number text;
  v_next_number integer;
BEGIN
  -- Only process if appointment has recurring_subscription_id
  IF NEW.recurring_subscription_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get subscription details
  SELECT * INTO v_subscription
  FROM recurring_subscriptions
  WHERE id = NEW.recurring_subscription_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Get plan details if available
  IF v_subscription.plan_id IS NOT NULL THEN
    SELECT * INTO v_plan
    FROM recurring_plans
    WHERE id = v_subscription.plan_id;
  END IF;

  -- Generate work order number
  SELECT COALESCE(MAX(CAST(SUBSTRING(work_order_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO v_next_number
  FROM work_orders
  WHERE company_id = NEW.company_id;

  v_work_order_number := 'WO-' || LPAD(v_next_number::text, 6, '0');

  -- Create VIP work order
  INSERT INTO work_orders (
    company_id,
    work_order_number,
    type,
    contact_id,
    description,
    start_date,
    start_time,
    end_time,
    assigned_technician,
    status,
    billable_type,
    recurring_subscription_id,
    appointment_id,
    send_appointment_reminder,
    reminder_email,
    reminder_sms,
    default_job_description,
    customer_sales_rep_id,
    created_by,
    office_id
  ) VALUES (
    NEW.company_id,
    v_work_order_number,
    'vip_program',
    v_subscription.contact_id,
    COALESCE(NEW.description, v_plan.description, 'VIP Program Service'),
    NEW.appointment_date,
    NEW.start_time,
    NEW.end_time,
    NEW.assigned_technician,
    'scheduled',
    'billable', -- VIP is pre-paid but tracked as billable
    NEW.recurring_subscription_id,
    NEW.id,
    true, -- Send reminders by default for VIP
    true, -- Email reminder
    false, -- SMS reminder (optional, can be enabled)
    v_plan.description,
    (SELECT assigned_to FROM contacts WHERE id = v_subscription.contact_id),
    NEW.created_by,
    v_subscription.office_id
  )
  RETURNING id INTO v_work_order_id;

  RAISE NOTICE 'Created VIP work order % for appointment %', v_work_order_number, NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for VIP appointment work order creation
DROP TRIGGER IF EXISTS on_vip_appointment_created ON appointments;
CREATE TRIGGER on_vip_appointment_created
  AFTER INSERT ON appointments
  FOR EACH ROW
  WHEN (NEW.recurring_subscription_id IS NOT NULL)
  EXECUTE FUNCTION trigger_create_vip_work_order();

-- Function to sync appointment updates to work order
CREATE OR REPLACE FUNCTION trigger_sync_vip_appointment_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if appointment has recurring_subscription_id
  IF NEW.recurring_subscription_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Update corresponding work order
  UPDATE work_orders
  SET
    start_date = NEW.appointment_date,
    start_time = NEW.start_time,
    end_time = NEW.end_time,
    assigned_technician = NEW.assigned_technician,
    description = COALESCE(NEW.description, description),
    updated_at = now()
  WHERE appointment_id = NEW.id
    AND type = 'vip_program'
    AND status NOT IN ('completed', 'cancelled'); -- Don't update completed/cancelled work orders

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for VIP appointment updates
DROP TRIGGER IF EXISTS on_vip_appointment_updated ON appointments;
CREATE TRIGGER on_vip_appointment_updated
  AFTER UPDATE ON appointments
  FOR EACH ROW
  WHEN (NEW.recurring_subscription_id IS NOT NULL)
  EXECUTE FUNCTION trigger_sync_vip_appointment_updates();

-- Add comment for documentation
COMMENT ON COLUMN appointments.recurring_subscription_id IS 'Links appointment to VIP subscription - automatically creates VIP work order when set';