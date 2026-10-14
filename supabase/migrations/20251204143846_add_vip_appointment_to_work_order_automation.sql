/*\n  # Add VIP Appointment to Work Order Automation\n\n  1. Schema Changes\n    - Add `recurring_subscription_id` to appointments table\n    - Link appointments to VIP subscriptions\n\n  2. Automation\n    - Create trigger to auto-generate VIP work orders from appointments\n    - Auto-populate work order details from appointment and subscription\n    - Link work order back to originating appointment\n\n  3. Business Logic\n    - Only create work orders for VIP subscriptions (plan_type = 'vip')\n    - Work order inherits appointment date/time and contact info\n    - Populate description from subscription plan details\n    - Enable appointment reminders by default for VIP work orders\n*/\n\n-- Add recurring_subscription_id to appointments\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'appointments' AND column_name = 'recurring_subscription_id'\n  ) THEN\n    ALTER TABLE appointments \n    ADD COLUMN recurring_subscription_id uuid REFERENCES recurring_subscriptions(id) ON DELETE SET NULL

\n  END IF

\nEND $$

\n\n-- Create index for VIP appointment lookups\nCREATE INDEX IF NOT EXISTS idx_appointments_recurring_subscription\n  ON appointments(recurring_subscription_id)\n  WHERE recurring_subscription_id IS NOT NULL

\n\n-- Function to automatically create work order from VIP appointment\nCREATE OR REPLACE FUNCTION create_work_order_from_vip_appointment()\nRETURNS TRIGGER\nSECURITY DEFINER\nSET search_path = public\nLANGUAGE plpgsql\nAS $$\nDECLARE\n  v_subscription RECORD

\n  v_plan RECORD

\n  v_work_order_id uuid

\n  v_work_order_number text

\nBEGIN\n  -- Only process if appointment has a recurring_subscription_id\n  IF NEW.recurring_subscription_id IS NULL THEN\n    RETURN NEW

\n  END IF

\n\n  -- Get subscription details\n  SELECT * INTO v_subscription\n  FROM recurring_subscriptions\n  WHERE id = NEW.recurring_subscription_id

\n\n  -- If subscription not found, return\n  IF NOT FOUND THEN\n    RETURN NEW

\n  END IF

\n\n  -- Get plan details\n  SELECT * INTO v_plan\n  FROM recurring_plans\n  WHERE id = v_subscription.plan_id

\n\n  -- Only create work orders for VIP plans\n  IF NOT FOUND OR v_plan.plan_type != 'vip' THEN\n    RETURN NEW

\n  END IF

\n\n  -- Generate work order number\n  v_work_order_number := 'WO-' || to_char(NEW.appointment_date, 'YYYYMMDD') || '-' || \n                         substring(gen_random_uuid()::text, 1, 8)

\n\n  -- Create the work order\n  INSERT INTO work_orders (\n    company_id,\n    contact_id,\n    type,\n    status,\n    priority,\n    work_order_number,\n    description,\n    scheduled_date,\n    scheduled_start_time,\n    scheduled_end_time,\n    location_address,\n    billable_type,\n    recurring_subscription_id,\n    appointment_id,\n    send_appointment_reminder,\n    reminder_email,\n    reminder_sms,\n    created_at\n  ) VALUES (\n    NEW.company_id,\n    NEW.contact_id,\n    'vip_program',\n    'scheduled',\n    'medium',\n    v_work_order_number,\n    COALESCE(\n      v_plan.name || ' - ' || COALESCE(v_plan.description, ''),\n      NEW.title || ' - VIP Service'\n    ),\n    NEW.appointment_date,\n    NEW.start_time,\n    NEW.end_time,\n    NEW.location,\n    'billable',\n    NEW.recurring_subscription_id,\n    NEW.id,\n    NEW.send_reminder,\n    true,\n    NEW.send_reminder,\n    now()\n  )\n  RETURNING id INTO v_work_order_id

\n\n  RAISE NOTICE 'Created VIP work order % for appointment %', v_work_order_number, NEW.id

\n\n  RETURN NEW

\nEND

\n$$

\n\n-- Create trigger on appointments insert\nDROP TRIGGER IF EXISTS trg_create_vip_work_order ON appointments

\nCREATE TRIGGER trg_create_vip_work_order\n  AFTER INSERT ON appointments\n  FOR EACH ROW\n  EXECUTE FUNCTION create_work_order_from_vip_appointment()

\n\n-- Grant necessary permissions\nGRANT EXECUTE ON FUNCTION create_work_order_from_vip_appointment() TO authenticated

\n
