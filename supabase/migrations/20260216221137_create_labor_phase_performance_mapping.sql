/*
  # Create Labor Phase Performance Mapping System

  1. New Tables
    - `labor_phase_performance_mapping`
      - Maps labor phases to performance tracking categories
      - `labor_phase_id` (uuid, FK to labor_phases)
      - `counts_against_target` (boolean) - true = counts as field labor, false = excluded
      - `updated_at` (timestamptz)

    - `labor_phase_mapping_audit`
      - Tracks changes to phase mappings
      - `labor_phase_id` (uuid)
      - `admin_id` (uuid, FK to profiles)
      - `old_value` (boolean)
      - `new_value` (boolean)
      - `reason` (text)
      - `created_at` (timestamptz)

  2. Default Mappings
    - Install, Programming, Service, Commissioning, Warranty, Troubleshooting, Punchlist = counts against target (true)
    - PM Oversight, Admin, Purchasing, Scheduling, Manufacturer Defect, Internal Meetings = excluded (false)

  3. Security
    - Enable RLS on both tables
    - All authenticated users can read mappings
    - Only admins can modify mappings
    - All authenticated users can view audit trail
*/

-- Create labor_phase_performance_mapping table
CREATE TABLE IF NOT EXISTS labor_phase_performance_mapping (
  labor_phase_id uuid PRIMARY KEY REFERENCES labor_phases(id) ON DELETE CASCADE,
  counts_against_target boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

-- Create audit table for mapping changes
CREATE TABLE IF NOT EXISTS labor_phase_mapping_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_phase_id uuid NOT NULL REFERENCES labor_phases(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  old_value boolean,
  new_value boolean NOT NULL,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_labor_phase_mapping_counts_against_target
  ON labor_phase_performance_mapping(counts_against_target);

CREATE INDEX IF NOT EXISTS idx_labor_phase_mapping_audit_phase
  ON labor_phase_mapping_audit(labor_phase_id);

CREATE INDEX IF NOT EXISTS idx_labor_phase_mapping_audit_admin
  ON labor_phase_mapping_audit(admin_id);

CREATE INDEX IF NOT EXISTS idx_labor_phase_mapping_audit_created
  ON labor_phase_mapping_audit(created_at DESC);

-- Enable RLS
ALTER TABLE labor_phase_performance_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_phase_mapping_audit ENABLE ROW LEVEL SECURITY;

-- RLS Policies for labor_phase_performance_mapping
CREATE POLICY "All authenticated users can view labor phase mappings"
  ON labor_phase_performance_mapping
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can insert labor phase mappings"
  ON labor_phase_performance_mapping
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Only admins can update labor phase mappings"
  ON labor_phase_performance_mapping
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- RLS Policies for labor_phase_mapping_audit
CREATE POLICY "All authenticated users can view mapping audit trail"
  ON labor_phase_mapping_audit
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can insert audit records"
  ON labor_phase_mapping_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Function to update labor phase mapping with audit trail
CREATE OR REPLACE FUNCTION update_labor_phase_mapping(
  p_labor_phase_id uuid,
  p_counts_against_target boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_value boolean;
  v_admin_id uuid;
BEGIN
  -- Get current user
  v_admin_id := auth.uid();

  -- Verify admin role
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'Only admins can update labor phase mappings';
  END IF;

  -- Get old value if exists
  SELECT counts_against_target INTO v_old_value
  FROM labor_phase_performance_mapping
  WHERE labor_phase_id = p_labor_phase_id;

  -- Insert or update mapping
  INSERT INTO labor_phase_performance_mapping (labor_phase_id, counts_against_target, updated_at)
  VALUES (p_labor_phase_id, p_counts_against_target, now())
  ON CONFLICT (labor_phase_id)
  DO UPDATE SET
    counts_against_target = p_counts_against_target,
    updated_at = now();

  -- Create audit record
  INSERT INTO labor_phase_mapping_audit (
    labor_phase_id,
    admin_id,
    old_value,
    new_value,
    reason
  ) VALUES (
    p_labor_phase_id,
    v_admin_id,
    v_old_value,
    p_counts_against_target,
    p_reason
  );
END;
$$;

-- Seed default mappings for all existing labor phases
-- Phases that count against target (field labor)
INSERT INTO labor_phase_performance_mapping (labor_phase_id, counts_against_target)
SELECT id, true
FROM labor_phases
WHERE LOWER(name) IN ('install', 'installation', 'programming', 'service', 'service call',
                       'commissioning', 'warranty', 'troubleshooting', 'punchlist', 'repair',
                       'preventive maintenance', 'emergency service')
ON CONFLICT (labor_phase_id) DO NOTHING;

-- Phases that don't count against target (non-performance labor)
INSERT INTO labor_phase_performance_mapping (labor_phase_id, counts_against_target)
SELECT id, false
FROM labor_phases
WHERE LOWER(name) IN ('pm oversight', 'admin', 'administrative', 'purchasing', 'scheduling',
                       'manufacturer defect', 'internal meetings', 'training', 'travel',
                       'warranty claim', 'callbacks')
ON CONFLICT (labor_phase_id) DO NOTHING;

-- Default any remaining phases to count against target
INSERT INTO labor_phase_performance_mapping (labor_phase_id, counts_against_target)
SELECT id, true
FROM labor_phases
WHERE id NOT IN (SELECT labor_phase_id FROM labor_phase_performance_mapping)
ON CONFLICT (labor_phase_id) DO NOTHING;