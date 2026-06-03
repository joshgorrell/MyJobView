/*
  # Job Split and Merge System

  1. New Tables
    - `job_splits`
      - Track jobs that have been split into multiple parts
      - `id` (uuid, primary key)
      - `parent_work_order_id` (uuid, references work_orders)
      - `split_type` (text) - multi_day, multi_tech, multi_task
      - `split_reason` (text)
      - `total_parts` (integer)
      - `created_by` (uuid, references profiles)
      - `created_at` (timestamptz)

    - `job_split_parts`
      - Individual parts of a split job
      - `id` (uuid, primary key)
      - `job_split_id` (uuid, references job_splits)
      - `work_order_id` (uuid, references work_orders)
      - `part_number` (integer)
      - `assigned_to` (uuid, references profiles, nullable)
      - `scheduled_date` (date, nullable)
      - `description` (text)
      - `estimated_hours` (numeric)
      - `status` (text)
      - `created_at` (timestamptz)

    - `job_merges`
      - Track multiple jobs merged into one
      - `id` (uuid, primary key)
      - `target_work_order_id` (uuid, references work_orders)
      - `merge_reason` (text)
      - `merged_by` (uuid, references profiles)
      - `created_at` (timestamptz)

    - `job_merge_sources`
      - Source jobs that were merged
      - `id` (uuid, primary key)
      - `job_merge_id` (uuid, references job_merges)
      - `source_work_order_id` (uuid, references work_orders)
      - `merged_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Dispatchers and admins can manage splits/merges
    - All authenticated users can view
*/

-- Create job_splits table
CREATE TABLE IF NOT EXISTS job_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  split_type text NOT NULL CHECK (split_type IN ('multi_day', 'multi_tech', 'multi_task')),
  split_reason text,
  total_parts integer NOT NULL CHECK (total_parts > 1),
  created_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create job_split_parts table
CREATE TABLE IF NOT EXISTS job_split_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_split_id uuid REFERENCES job_splits(id) ON DELETE CASCADE NOT NULL,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  part_number integer NOT NULL CHECK (part_number > 0),
  assigned_to uuid REFERENCES profiles(id),
  scheduled_date date,
  description text NOT NULL,
  estimated_hours numeric(4, 1) NOT NULL DEFAULT 1.0,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(job_split_id, part_number),
  UNIQUE(work_order_id)
);

-- Create job_merges table
CREATE TABLE IF NOT EXISTS job_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE NOT NULL,
  merge_reason text,
  merged_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create job_merge_sources table
CREATE TABLE IF NOT EXISTS job_merge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_merge_id uuid REFERENCES job_merges(id) ON DELETE CASCADE NOT NULL,
  source_work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  merged_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_job_splits_parent ON job_splits(parent_work_order_id);
CREATE INDEX IF NOT EXISTS idx_job_split_parts_split ON job_split_parts(job_split_id, part_number);
CREATE INDEX IF NOT EXISTS idx_job_split_parts_wo ON job_split_parts(work_order_id);
CREATE INDEX IF NOT EXISTS idx_job_split_parts_tech ON job_split_parts(assigned_to, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_job_merges_target ON job_merges(target_work_order_id);
CREATE INDEX IF NOT EXISTS idx_job_merge_sources_merge ON job_merge_sources(job_merge_id);

-- Enable RLS
ALTER TABLE job_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_split_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_merge_sources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for job_splits
CREATE POLICY "Anyone can view job splits"
  ON job_splits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Dispatchers can create job splits"
  ON job_splits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatcher', 'manager')
    )
  );

-- RLS Policies for job_split_parts
CREATE POLICY "Anyone can view job split parts"
  ON job_split_parts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Dispatchers can manage job split parts"
  ON job_split_parts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatcher', 'manager')
    )
  );

-- RLS Policies for job_merges
CREATE POLICY "Anyone can view job merges"
  ON job_merges FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Dispatchers can create job merges"
  ON job_merges FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatcher', 'manager')
    )
  );

-- RLS Policies for job_merge_sources
CREATE POLICY "Anyone can view job merge sources"
  ON job_merge_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Dispatchers can manage job merge sources"
  ON job_merge_sources FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatcher', 'manager')
    )
  );

-- Add helper columns to work_orders
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'work_orders' AND column_name = 'is_split_part'
  ) THEN
    ALTER TABLE work_orders 
    ADD COLUMN is_split_part boolean DEFAULT false,
    ADD COLUMN parent_split_id uuid REFERENCES job_splits(id),
    ADD COLUMN is_merge_target boolean DEFAULT false,
    ADD COLUMN merge_id uuid REFERENCES job_merges(id);
  END IF;
END $$;

-- Create index for split/merge tracking
CREATE INDEX IF NOT EXISTS idx_work_orders_split_part ON work_orders(is_split_part, parent_split_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_merge_target ON work_orders(is_merge_target, merge_id);

-- Add helpful comments
COMMENT ON TABLE job_splits IS 'Tracks jobs that have been split into multiple parts';
COMMENT ON TABLE job_split_parts IS 'Individual parts of a split job with separate assignments';
COMMENT ON TABLE job_merges IS 'Tracks multiple jobs that have been merged into one';
COMMENT ON TABLE job_merge_sources IS 'Source jobs that were merged together';

COMMENT ON COLUMN job_splits.split_type IS 'Type: multi_day (span days), multi_tech (multiple techs), multi_task (separate tasks)';
COMMENT ON COLUMN work_orders.is_split_part IS 'True if this work order is part of a split job';
COMMENT ON COLUMN work_orders.is_merge_target IS 'True if this work order is result of merge';
