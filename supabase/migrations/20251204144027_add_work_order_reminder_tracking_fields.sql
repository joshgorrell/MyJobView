/*\n  # Add Work Order Reminder Tracking Fields\n\n  1. Schema Changes\n    - Add `reminder_hours_before` to work_orders (default 24 hours)\n    - Add `reminder_sent_at` to track when reminder was sent\n    - Add `scheduled_start_time` and `scheduled_end_time` for appointment timing\n    \n  2. Purpose\n    - Enable configurable reminder timing per work order\n    - Track reminder delivery to prevent duplicates\n    - Support automated reminder scheduling\n    - Store appointment time details for VIP and service work orders\n*/\n\n-- Add reminder_hours_before column\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'work_orders' AND column_name = 'reminder_hours_before'\n  ) THEN\n    ALTER TABLE work_orders \n    ADD COLUMN reminder_hours_before integer DEFAULT 24

\n  END IF

\nEND $$

\n\n-- Add reminder_sent_at column\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'work_orders' AND column_name = 'reminder_sent_at'\n  ) THEN\n    ALTER TABLE work_orders \n    ADD COLUMN reminder_sent_at timestamptz DEFAULT NULL

\n  END IF

\nEND $$

\n\n-- Add scheduled_start_time column\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'work_orders' AND column_name = 'scheduled_start_time'\n  ) THEN\n    ALTER TABLE work_orders \n    ADD COLUMN scheduled_start_time time DEFAULT NULL

\n  END IF

\nEND $$

\n\n-- Add scheduled_end_time column\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'work_orders' AND column_name = 'scheduled_end_time'\n  ) THEN\n    ALTER TABLE work_orders \n    ADD COLUMN scheduled_end_time time DEFAULT NULL

\n  END IF

\nEND $$

\n\n-- Add location_address column for work orders\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'work_orders' AND column_name = 'location_address'\n  ) THEN\n    ALTER TABLE work_orders \n    ADD COLUMN location_address text DEFAULT NULL

\n  END IF

\nEND $$

\n\n-- Add billable_type column\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns\n    WHERE table_name = 'work_orders' AND column_name = 'billable_type'\n  ) THEN\n    ALTER TABLE work_orders \n    ADD COLUMN billable_type text DEFAULT 'billable' CHECK (billable_type IN ('billable', 'warranty', 'internal'))

\n  END IF

\nEND $$

\n\n-- Create index for reminder queries (using start_date which is the actual column name)\nCREATE INDEX IF NOT EXISTS idx_work_orders_reminder_pending\n  ON work_orders(start_date, send_appointment_reminder)\n  WHERE send_appointment_reminder = true AND reminder_sent_at IS NULL

\n\nCOMMENT ON COLUMN work_orders.reminder_hours_before IS 'Number of hours before scheduled time to send reminder'

\nCOMMENT ON COLUMN work_orders.reminder_sent_at IS 'Timestamp when reminder was sent to customer'

\nCOMMENT ON COLUMN work_orders.scheduled_start_time IS 'Scheduled start time for the work order appointment'

\nCOMMENT ON COLUMN work_orders.scheduled_end_time IS 'Scheduled end time for the work order appointment'

\nCOMMENT ON COLUMN work_orders.location_address IS 'Service location address for the work order'

\nCOMMENT ON COLUMN work_orders.billable_type IS 'Billing type: billable (charge customer), warranty (no charge), internal (company use)'

\n
