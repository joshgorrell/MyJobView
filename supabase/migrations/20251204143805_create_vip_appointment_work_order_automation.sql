/*\n  # VIP Appointment to Work Order Automation\n\n  1. Schema Changes\n    - Add recurring_subscription_id to appointments table\n    - Links appointments to VIP program subscriptions\n\n  2. Automation Trigger\n    - Automatically creates work orders when VIP appointments are scheduled\n    - Links work order to appointment and subscription\n    - Sets work order type to 'vip_program'\n    - Copies relevant details (contact, technician, date, description)\n\n  3. Logic\n    - Triggers on INSERT and UPDATE of appointments\n    - Only creates work order if subscription is active VIP plan\n    - Only creates work order if it doesn't already exist for this appointment\n    - Sets work order scheduled date from appointment date/time\n\n  4. Benefits\n    - Eliminates manual work order creation for VIP visits\n    - Ensures all VIP appointments have corresponding work orders\n    - Maintains proper linking between subscriptions, appointments, and work orders\n    - Enables accurate tracking and billing of VIP services\n*/\n\n-- Add recurring_subscription_id to appointments table\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'appointments' AND column_name = 'recurring_subscription_id'\n  ) THEN\n    ALTER TABLE appointments\n    ADD COLUMN recurring_subscription_id uuid REFERENCES recurring_subscriptions(id) ON DELETE SET NULL

\n  END IF

\nEND $$

\n\n-- Create index for faster lookups\nCREATE INDEX IF NOT EXISTS idx_appointments_subscription\n  ON appointments(recurring_subscription_id)\n  WHERE recurring_subscription_id IS NOT NULL

\n\n-- Function to automatically create work orders for VIP appointments\nCREATE OR REPLACE FUNCTION create_vip_work_order_from_appointment()\nRETURNS TRIGGER AS $$\nDECLARE\n  v_subscription RECORD

\n  v_plan RECORD

\n  v_work_order_id uuid

\n  v_scheduled_datetime timestamptz

\nBEGIN\n  -- Only proceed if appointment has a subscription\n  IF NEW.recurring_subscription_id IS NULL THEN\n    RETURN NEW

\n  END IF

\n\n  -- Get subscription and plan details\n  SELECT s.*, p.plan_type\n  INTO v_subscription\n  FROM recurring_subscriptions s\n  JOIN recurring_plans p ON p.id = s.plan_id\n  WHERE s.id = NEW.recurring_subscription_id

\n\n  -- Only create work order if subscription exists and is for VIP program\n  IF NOT FOUND OR v_subscription.plan_type != 'vip_program' THEN\n    RETURN NEW

\n  END IF

\n\n  -- Check if subscription is active\n  IF v_subscription.status NOT IN ('active') THEN\n    RETURN NEW

\n  END IF

\n\n  -- Check if work order already exists for this appointment\n  IF EXISTS (\n    SELECT 1 FROM work_orders\n    WHERE appointment_id = NEW.id\n  ) THEN\n    RETURN NEW

\n  END IF

\n\n  -- Combine appointment date and start time to create scheduled datetime\n  v_scheduled_datetime := (NEW.appointment_date || ' ' || NEW.start_time)::timestamptz

\n\n  -- Create the work order\n  INSERT INTO work_orders (\n    company_id,\n    work_order_number,\n    type,\n    contact_id,\n    description,\n    scheduled_date,\n    priority,\n    status,\n    assigned_to,\n    recurring_subscription_id,\n    appointment_id,\n    billable_type,\n    send_appointment_reminder,\n    reminder_email,\n    created_by\n  ) VALUES (\n    NEW.company_id,\n    'WO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'),\n    'vip_program',\n    NEW.contact_id,\n    COALESCE(NEW.description, NEW.title || ' - VIP Program Visit'),\n    v_scheduled_datetime,\n    'medium',\n    'scheduled',\n    NEW.assigned_technician,\n    NEW.recurring_subscription_id,\n    NEW.id,\n    'billable',\n    NEW.send_appointment_reminder,\n    NEW.reminder_email,\n    NEW.created_by\n  ) RETURNING id INTO v_work_order_id

\n\n  -- Log the creation\n  RAISE NOTICE 'Created VIP work order % for appointment %', v_work_order_id, NEW.id

\n\n  RETURN NEW

\nEND

\n$$ LANGUAGE plpgsql SECURITY DEFINER

\n\n-- Create trigger for new appointments\nDROP TRIGGER IF EXISTS on_vip_appointment_create_work_order ON appointments

\nCREATE TRIGGER on_vip_appointment_create_work_order\n  AFTER INSERT ON appointments\n  FOR EACH ROW\n  EXECUTE FUNCTION create_vip_work_order_from_appointment()

\n\n-- Create trigger for appointment updates (in case subscription is added later)\nDROP TRIGGER IF EXISTS on_vip_appointment_update_work_order ON appointments

\nCREATE TRIGGER on_vip_appointment_update_work_order\n  AFTER UPDATE OF recurring_subscription_id ON appointments\n  FOR EACH ROW\n  WHEN (NEW.recurring_subscription_id IS NOT NULL AND OLD.recurring_subscription_id IS NULL)\n  EXECUTE FUNCTION create_vip_work_order_from_appointment()

\n\n-- Function to sync appointment changes to linked work orders\nCREATE OR REPLACE FUNCTION sync_vip_appointment_to_work_order()\nRETURNS TRIGGER AS $$\nDECLARE\n  v_scheduled_datetime timestamptz

\nBEGIN\n  -- Only proceed if appointment has linked work order\n  IF NOT EXISTS (\n    SELECT 1 FROM work_orders\n    WHERE appointment_id = NEW.id\n  ) THEN\n    RETURN NEW

\n  END IF

\n\n  -- Combine appointment date and start time\n  v_scheduled_datetime := (NEW.appointment_date || ' ' || NEW.start_time)::timestamptz

\n\n  -- Update the linked work order with appointment changes\n  UPDATE work_orders\n  SET\n    description = COALESCE(NEW.description, NEW.title || ' - VIP Program Visit'),\n    scheduled_date = v_scheduled_datetime,\n    assigned_to = NEW.assigned_technician,\n    status = CASE\n      WHEN NEW.status = 'completed' THEN 'completed'\n      WHEN NEW.status = 'cancelled' THEN 'cancelled'\n      WHEN NEW.status = 'in_progress' THEN 'in_progress'\n      ELSE status\n    END,\n    updated_at = NOW()\n  WHERE appointment_id = NEW.id\n    AND type = 'vip_program'\n    AND status NOT IN ('completed', 'cancelled')

\n\n  RETURN NEW

\nEND

\n$$ LANGUAGE plpgsql SECURITY DEFINER

\n\n-- Create trigger to sync appointment changes to work orders\nDROP TRIGGER IF EXISTS on_vip_appointment_sync_to_work_order ON appointments

\nCREATE TRIGGER on_vip_appointment_sync_to_work_order\n  AFTER UPDATE ON appointments\n  FOR EACH ROW\n  WHEN (\n    OLD.appointment_date IS DISTINCT FROM NEW.appointment_date OR\n    OLD.start_time IS DISTINCT FROM NEW.start_time OR\n    OLD.description IS DISTINCT FROM NEW.description OR\n    OLD.assigned_technician IS DISTINCT FROM NEW.assigned_technician OR\n    OLD.status IS DISTINCT FROM NEW.status\n  )\n  EXECUTE FUNCTION sync_vip_appointment_to_work_order()

\n
