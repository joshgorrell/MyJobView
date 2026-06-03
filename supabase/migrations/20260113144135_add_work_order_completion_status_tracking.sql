/*
  # Add Work Order Completion Status Tracking

  1. Changes
    - Add `feedback_email_sent` boolean column to work_orders (default false)
    - Add `feedback_email_sent_at` timestamptz column to work_orders (nullable)
    - Add `marked_complete` boolean column to time_entries (default false)
    - Add indexes for efficient querying
    - Add constraint to ensure feedback_email_sent_at is only set when feedback_email_sent is true

  2. Purpose
    - Track when jobs are actually complete vs just done for the day
    - Prevent duplicate feedback emails to customers
    - Allow service manager to see completion status
    - Track which clock-out marked the job complete

  3. Notes
    - feedback_email_sent flag prevents duplicate emails
    - marked_complete in time_entries tracks which clock-out completed the job
    - Indexes improve query performance for dashboard views
*/

-- Add columns to work_orders table
ALTER TABLE work_orders
ADD COLUMN IF NOT EXISTS feedback_email_sent boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS feedback_email_sent_at timestamptz;

-- Add column to time_entries table
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS marked_complete boolean DEFAULT false NOT NULL;

-- Add constraint to ensure consistency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'feedback_email_sent_at_consistency'
  ) THEN
    ALTER TABLE work_orders
    ADD CONSTRAINT feedback_email_sent_at_consistency
    CHECK (
      (feedback_email_sent = false AND feedback_email_sent_at IS NULL) OR
      (feedback_email_sent = true)
    );
  END IF;
END $$;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_work_orders_feedback_sent
ON work_orders(feedback_email_sent, actual_completion_date);

CREATE INDEX IF NOT EXISTS idx_work_orders_completed_today
ON work_orders(status, actual_completion_date)
WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_time_entries_marked_complete
ON time_entries(work_order_id, marked_complete)
WHERE marked_complete = true;

-- Add comment explaining the workflow
COMMENT ON COLUMN work_orders.feedback_email_sent IS
'Tracks if customer feedback email has been sent. Prevents duplicate emails when multiple techs work on same job.';

COMMENT ON COLUMN work_orders.feedback_email_sent_at IS
'Timestamp when customer feedback email was sent.';

COMMENT ON COLUMN time_entries.marked_complete IS
'Tracks if this clock-out marked the work order as complete. Used to identify which tech completed the job.';