/*\n  # Create Time Adjustment Request System\n\n  1. New Tables\n    - `time_adjustment_requests`\n      - Tracks technician requests to adjust their clock in/out times\n      - Includes requested changes, reason, and approval workflow\n      - Links to original daily_clock_entries entry\n\n  2. Changes\n    - Technicians can request adjustments to their times\n    - Admin or Finance must approve/deny requests\n    - Approved requests automatically update the daily_clock_entries entry\n    - Full audit trail of all requests and decisions\n\n  3. Security\n    - Enable RLS on all tables\n    - Technicians can create requests for their own entries\n    - Technicians can view their own requests\n    - Admin and Finance can view and approve/deny all requests\n*/\n\n-- Create time adjustment requests table\nCREATE TABLE IF NOT EXISTS time_adjustment_requests (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  time_entry_id uuid NOT NULL REFERENCES daily_clock_entries(id) ON DELETE CASCADE,\n  technician_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,\n  \n  -- Original values\n  original_clock_in timestamptz NOT NULL,\n  original_clock_out timestamptz,\n  original_break_minutes int DEFAULT 0,\n  \n  -- Requested changes\n  requested_clock_in timestamptz NOT NULL,\n  requested_clock_out timestamptz,\n  requested_break_minutes int DEFAULT 0,\n  \n  -- Request details\n  reason text NOT NULL,\n  request_notes text,\n  \n  -- Approval workflow\n  status text NOT NULL DEFAULT 'pending',\n  reviewed_by uuid REFERENCES profiles(id),\n  reviewed_at timestamptz,\n  review_notes text,\n  \n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now(),\n  \n  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),\n  CONSTRAINT valid_times CHECK (\n    requested_clock_in < COALESCE(requested_clock_out, requested_clock_in + INTERVAL '1 day')\n  )\n)

\n\n-- Add indexes for performance\nCREATE INDEX IF NOT EXISTS idx_time_adjustment_requests_technician ON time_adjustment_requests(technician_id)

\nCREATE INDEX IF NOT EXISTS idx_time_adjustment_requests_status ON time_adjustment_requests(status)

\nCREATE INDEX IF NOT EXISTS idx_time_adjustment_requests_time_entry ON time_adjustment_requests(time_entry_id)

\nCREATE INDEX IF NOT EXISTS idx_time_adjustment_requests_created ON time_adjustment_requests(created_at DESC)

\n\n-- Enable RLS\nALTER TABLE time_adjustment_requests ENABLE ROW LEVEL SECURITY

\n\n-- Policy: Technicians can create requests for their own time entries\nCREATE POLICY "Technicians can create own adjustment requests"\n  ON time_adjustment_requests\n  FOR INSERT\n  TO authenticated\n  WITH CHECK (auth.uid() = technician_id)

\n\n-- Policy: Users can view their own requests\nCREATE POLICY "Users can view own adjustment requests"\n  ON time_adjustment_requests\n  FOR SELECT\n  TO authenticated\n  USING (auth.uid() = technician_id)

\n\n-- Policy: Admin and Finance can view all requests\nCREATE POLICY "Admin and Finance can view all adjustment requests"\n  ON time_adjustment_requests\n  FOR SELECT\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('admin', 'finance')\n    )\n  )

\n\n-- Policy: Admin and Finance can update (approve/deny) requests\nCREATE POLICY "Admin and Finance can review adjustment requests"\n  ON time_adjustment_requests\n  FOR UPDATE\n  TO authenticated\n  USING (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('admin', 'finance')\n    )\n  )\n  WITH CHECK (\n    EXISTS (\n      SELECT 1 FROM profiles\n      WHERE profiles.id = auth.uid()\n      AND profiles.role IN ('admin', 'finance')\n    )\n  )

\n\n-- Policy: Technicians can cancel their own pending requests\nCREATE POLICY "Technicians can cancel own pending requests"\n  ON time_adjustment_requests\n  FOR UPDATE\n  TO authenticated\n  USING (\n    auth.uid() = technician_id\n    AND status = 'pending'\n  )\n  WITH CHECK (\n    auth.uid() = technician_id\n    AND status = 'cancelled'\n  )

\n\n-- Function to apply approved time adjustment\nCREATE OR REPLACE FUNCTION apply_time_adjustment()\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path TO 'public'\nAS $$\nDECLARE\n  v_new_total_hours numeric

\nBEGIN\n  -- Only process when status changes to 'approved'\n  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN\n    -- Calculate new total hours\n    IF NEW.requested_clock_out IS NOT NULL THEN\n      v_new_total_hours := EXTRACT(EPOCH FROM (NEW.requested_clock_out - NEW.requested_clock_in)) / 3600.0

\n      v_new_total_hours := v_new_total_hours - (NEW.requested_break_minutes / 60.0)

\n    ELSE\n      v_new_total_hours := 0

\n    END IF

\n\n    -- Update the daily_clock_entries entry\n    UPDATE daily_clock_entries\n    SET\n      clock_in = NEW.requested_clock_in,\n      clock_out = NEW.requested_clock_out,\n      break_minutes = NEW.requested_break_minutes,\n      total_hours = v_new_total_hours,\n      admin_adjusted = true,\n      adjustment_reason = NEW.reason || ' (Via adjustment request)',\n      admin_notes = NEW.review_notes,\n      updated_at = now()\n    WHERE id = NEW.time_entry_id

\n\n    -- Create notification for technician\n    INSERT INTO notifications (\n      user_id,\n      type,\n      title,\n      message,\n      related_id\n    ) VALUES (\n      NEW.technician_id,\n      'time_adjustment_approved',\n      'Time Adjustment Approved',\n      'Your time adjustment request has been approved by ' || \n        COALESCE((SELECT full_name FROM profiles WHERE id = NEW.reviewed_by), 'an administrator'),\n      NEW.id::text\n    )

\n  END IF

\n\n  -- Notify technician of denial\n  IF NEW.status = 'denied' AND (OLD.status IS NULL OR OLD.status != 'denied') THEN\n    INSERT INTO notifications (\n      user_id,\n      type,\n      title,\n      message,\n      related_id\n    ) VALUES (\n      NEW.technician_id,\n      'time_adjustment_denied',\n      'Time Adjustment Denied',\n      'Your time adjustment request has been denied. Reason: ' || COALESCE(NEW.review_notes, 'No reason provided'),\n      NEW.id::text\n    )

\n  END IF

\n\n  RETURN NEW

\nEND

\n$$

\n\n-- Create trigger to apply adjustments\nDROP TRIGGER IF EXISTS apply_time_adjustment_trigger ON time_adjustment_requests

\nCREATE TRIGGER apply_time_adjustment_trigger\n  AFTER UPDATE ON time_adjustment_requests\n  FOR EACH ROW\n  EXECUTE FUNCTION apply_time_adjustment()

\n\n-- Create notification trigger when request is created\nCREATE OR REPLACE FUNCTION notify_time_adjustment_requested()\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path TO 'public'\nAS $$\nBEGIN\n  -- Notify admins and finance that a new request needs review\n  INSERT INTO notifications (\n    user_id,\n    type,\n    title,\n    message,\n    related_id\n  )\n  SELECT \n    p.id,\n    'time_adjustment_requested',\n    'Time Adjustment Request',\n    (SELECT full_name FROM profiles WHERE id = NEW.technician_id) || ' has requested a time adjustment',\n    NEW.id::text\n  FROM profiles p\n  WHERE p.role IN ('admin', 'finance')

\n\n  RETURN NEW

\nEND

\n$$

\n\nDROP TRIGGER IF EXISTS notify_time_adjustment_requested_trigger ON time_adjustment_requests

\nCREATE TRIGGER notify_time_adjustment_requested_trigger\n  AFTER INSERT ON time_adjustment_requests\n  FOR EACH ROW\n  EXECUTE FUNCTION notify_time_adjustment_requested()

\n\nCOMMENT ON TABLE time_adjustment_requests IS 'Tracks technician requests to adjust their clock in/out times, requiring admin or finance approval'

\nCOMMENT ON FUNCTION apply_time_adjustment IS 'Automatically applies approved time adjustments to daily_clock_entries'

\n
