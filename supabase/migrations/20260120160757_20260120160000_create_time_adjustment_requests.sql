/*
  # Time Adjustment Request System

  1. New Tables
    - `time_adjustment_requests`
      - `id` (uuid, primary key)
      - `daily_clock_entry_id` (uuid, references daily_clock_entries)
      - `technician_id` (uuid, references profiles)
      - `current_clock_in` (timestamptz) - Original clock-in time
      - `current_clock_out` (timestamptz, nullable) - Original clock-out time
      - `requested_clock_in` (timestamptz) - Requested new clock-in time
      - `requested_clock_out` (timestamptz, nullable) - Requested new clock-out time
      - `reason_category` (text) - Forgot to clock in, Forgot to clock out, Wrong time entered, System error, Other
      - `explanation` (text) - Detailed explanation from technician
      - `status` (text) - pending, approved, denied, cancelled
      - `admin_notes` (text, nullable) - Admin's notes when reviewing
      - `reviewed_by` (uuid, nullable, references profiles)
      - `reviewed_at` (timestamptz, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on time_adjustment_requests
    - Technicians can view their own requests
    - Technicians can create requests and cancel pending ones
    - Admins can view all requests and approve/deny them

  3. Important Notes
    - Technicians can only edit entries 0-2 days old through request system
    - Admins can still directly edit any entry at any time
    - Requests create audit trail for time adjustments
*/

-- Add time_adjustment to notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'lead_assignment',
    'lead_status_change',
    'task_assignment',
    'task_due',
    'proposal_approved',
    'discussion_mention',
    'discussion_reply',
    'work_order_assignment',
    'service_request',
    'parts_request',
    'deposit_reminder',
    'proposal_reactivation',
    'proposal_message',
    'task_notification',
    'vip_signup',
    'product_request',
    'bug_report_assigned',
    'bug_report_status_change',
    'deposit_received',
    'home_clock_review',
    'late_clock_in',
    'work_order_feedback',
    'bug_report',
    'punchlist_service_request',
    'service_request_created',
    'time_adjustment',
    'system'
  )
);

-- Create time_adjustment_requests table
CREATE TABLE IF NOT EXISTS time_adjustment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_clock_entry_id uuid REFERENCES daily_clock_entries(id) ON DELETE CASCADE NOT NULL,
  technician_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  current_clock_in timestamptz NOT NULL,
  current_clock_out timestamptz,
  requested_clock_in timestamptz NOT NULL,
  requested_clock_out timestamptz,
  reason_category text NOT NULL CHECK (reason_category IN ('forgot_clock_in', 'forgot_clock_out', 'wrong_time', 'system_error', 'other')),
  explanation text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  admin_notes text,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_time_adj_requests_entry ON time_adjustment_requests(daily_clock_entry_id);
CREATE INDEX IF NOT EXISTS idx_time_adj_requests_tech ON time_adjustment_requests(technician_id);
CREATE INDEX IF NOT EXISTS idx_time_adj_requests_status ON time_adjustment_requests(status);
CREATE INDEX IF NOT EXISTS idx_time_adj_requests_created ON time_adjustment_requests(created_at DESC);

-- Enable RLS
ALTER TABLE time_adjustment_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Technicians can view their own requests
CREATE POLICY "Technicians can view own requests"
  ON time_adjustment_requests FOR SELECT
  TO authenticated
  USING (
    auth.uid() = technician_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'office_manager')
    )
  );

-- Technicians can create requests for their own entries
CREATE POLICY "Technicians can create requests"
  ON time_adjustment_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = technician_id
  );

-- Technicians can update their own pending requests (to cancel)
CREATE POLICY "Technicians can cancel own pending requests"
  ON time_adjustment_requests FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = technician_id
    AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = technician_id
    AND status IN ('pending', 'cancelled')
  );

-- Admins can update any request (to approve/deny)
CREATE POLICY "Admins can review requests"
  ON time_adjustment_requests FOR UPDATE
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

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_time_adj_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_time_adj_request_timestamp ON time_adjustment_requests;
CREATE TRIGGER update_time_adj_request_timestamp
  BEFORE UPDATE ON time_adjustment_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_time_adj_request_timestamp();

-- Function to send notification when request is reviewed
CREATE OR REPLACE FUNCTION notify_time_adjustment_review()
RETURNS TRIGGER AS $$
BEGIN
  -- Only send notification when status changes from pending to approved/denied
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'denied') THEN
    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      related_id
    ) VALUES (
      NEW.technician_id,
      'time_adjustment',
      CASE
        WHEN NEW.status = 'approved' THEN 'Time Adjustment Request Approved'
        ELSE 'Time Adjustment Request Denied'
      END,
      CASE
        WHEN NEW.status = 'approved' THEN 'Your time adjustment request has been approved by admin.'
        ELSE 'Your time adjustment request has been denied. Reason: ' || COALESCE(NEW.admin_notes, 'No reason provided.')
      END,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notify_time_adjustment_review ON time_adjustment_requests;
CREATE TRIGGER notify_time_adjustment_review
  AFTER UPDATE ON time_adjustment_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_time_adjustment_review();
