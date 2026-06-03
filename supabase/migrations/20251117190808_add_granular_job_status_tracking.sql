/*
  # Enhanced Job Status Tracking for Dispatch

  1. Updates to work_orders table
    - Add `current_location_status` (text) - en_route, on_site, traveling_between, at_shop
    - Add `needs_info` (boolean) - Flag for jobs requiring dispatcher attention
    - Add `blocked_reason` (text) - Reason if job is blocked
    - Add `estimated_arrival` (timestamptz) - ETA for tech arrival
    - Add `arrived_at` (timestamptz) - Actual arrival timestamp
    - Add `departed_at` (timestamptz) - When tech left job site
    - Add `last_status_update` (timestamptz) - Track status change time
    
  2. Create job_status_history table
    - Track all status changes for audit trail
    - `id` (uuid, primary key)
    - `work_order_id` (uuid, references work_orders)
    - `technician_id` (uuid, references profiles)
    - `old_status` (text)
    - `new_status` (text)
    - `location_status` (text, nullable)
    - `notes` (text, nullable)
    - `latitude` (numeric, nullable)
    - `longitude` (numeric, nullable)
    - `created_at` (timestamptz)

  3. Create job_acceptance_log table
    - Track when techs accept/decline jobs
    - `id` (uuid, primary key)
    - `work_order_id` (uuid, references work_orders)
    - `technician_id` (uuid, references profiles)
    - `action` (text) - accepted, declined, reassigned
    - `reason` (text, nullable)
    - `created_at` (timestamptz)

  4. Security
    - Enable RLS on new tables
    - Add policies for authenticated users
*/

-- Add new columns to work_orders
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'work_orders' AND column_name = 'current_location_status'
  ) THEN
    ALTER TABLE work_orders 
    ADD COLUMN current_location_status text,
    ADD COLUMN needs_info boolean DEFAULT false,
    ADD COLUMN blocked_reason text,
    ADD COLUMN estimated_arrival timestamptz,
    ADD COLUMN arrived_at timestamptz,
    ADD COLUMN departed_at timestamptz,
    ADD COLUMN last_status_update timestamptz DEFAULT now();
  END IF;
END $$;

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_work_orders_location_status 
  ON work_orders(current_location_status) 
  WHERE current_location_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_needs_info 
  ON work_orders(needs_info) 
  WHERE needs_info = true;

-- Create job_status_history table
CREATE TABLE IF NOT EXISTS job_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  technician_id uuid REFERENCES profiles(id),
  old_status text,
  new_status text NOT NULL,
  location_status text,
  notes text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for job_status_history
CREATE INDEX IF NOT EXISTS idx_job_status_history_work_order 
  ON job_status_history(work_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_status_history_technician 
  ON job_status_history(technician_id, created_at DESC);

-- Create job_acceptance_log table
CREATE TABLE IF NOT EXISTS job_acceptance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  technician_id uuid REFERENCES profiles(id) NOT NULL,
  action text NOT NULL CHECK (action IN ('accepted', 'declined', 'reassigned', 'auto_accepted')),
  reason text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for job_acceptance_log
CREATE INDEX IF NOT EXISTS idx_job_acceptance_log_work_order 
  ON job_acceptance_log(work_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_acceptance_log_technician 
  ON job_acceptance_log(technician_id, created_at DESC);

-- Enable RLS
ALTER TABLE job_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_acceptance_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for job_status_history
CREATE POLICY "Users can view job status history"
  ON job_status_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Techs and dispatch can insert job status history"
  ON job_status_history FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = technician_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatcher', 'manager')
    )
  );

-- RLS Policies for job_acceptance_log
CREATE POLICY "Users can view job acceptance log"
  ON job_acceptance_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Techs can log their own acceptance actions"
  ON job_acceptance_log FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = technician_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatcher', 'manager')
    )
  );

-- Create function to automatically log status changes
CREATE OR REPLACE FUNCTION log_work_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO job_status_history (
      work_order_id,
      technician_id,
      old_status,
      new_status,
      location_status
    ) VALUES (
      NEW.id,
      NEW.assigned_to,
      OLD.status,
      NEW.status,
      NEW.current_location_status
    );
    
    -- Update last_status_update timestamp
    NEW.last_status_update = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for status change logging
DROP TRIGGER IF EXISTS trigger_log_work_order_status_change ON work_orders;
CREATE TRIGGER trigger_log_work_order_status_change
  BEFORE UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION log_work_order_status_change();

-- Add helpful comments
COMMENT ON COLUMN work_orders.current_location_status IS 'Real-time location status: en_route, on_site, traveling_between, at_shop';
COMMENT ON COLUMN work_orders.needs_info IS 'Flag indicating job requires dispatcher attention';
COMMENT ON COLUMN work_orders.blocked_reason IS 'Reason if job is blocked or cannot proceed';
COMMENT ON COLUMN work_orders.estimated_arrival IS 'Estimated time of tech arrival';
COMMENT ON COLUMN work_orders.arrived_at IS 'Actual timestamp when tech arrived on site';
COMMENT ON COLUMN work_orders.departed_at IS 'Timestamp when tech left the job site';

COMMENT ON TABLE job_status_history IS 'Audit trail of all work order status changes';
COMMENT ON TABLE job_acceptance_log IS 'Log of technician job acceptance/decline actions';
