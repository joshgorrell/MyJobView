/*
  # Add Manual Time Entry Points Deduction System

  1. Changes to `daily_clock_entries`
    - Add `deduct_points` (boolean) - Whether points should be deducted for this manual entry
    - Add `points_deducted` (integer) - How many points were deducted

  2. Changes to `points_configuration`
    - Add `manual_entry_points_loss` (integer) - Default points to deduct for manual entries

  3. Security
    - Add INSERT policy for admins to create manual entries for any technician
    - Update existing policies to work with manual entries
*/

-- Add columns to daily_clock_entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'deduct_points'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN deduct_points boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clock_entries' AND column_name = 'points_deducted'
  ) THEN
    ALTER TABLE daily_clock_entries ADD COLUMN points_deducted integer DEFAULT 0;
  END IF;
END $$;

-- Add column to points_configuration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'points_configuration' AND column_name = 'manual_entry_points_loss'
  ) THEN
    ALTER TABLE points_configuration ADD COLUMN manual_entry_points_loss integer DEFAULT 10 NOT NULL CHECK (manual_entry_points_loss >= 0);
  END IF;
END $$;

-- Add INSERT policy for admins to create manual entries for any technician
DROP POLICY IF EXISTS "Admins can create manual time entries for any tech" ON daily_clock_entries;
CREATE POLICY "Admins can create manual time entries for any tech"
  ON daily_clock_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'office_manager')
    )
  );

-- Function to deduct points for manual time entry
CREATE OR REPLACE FUNCTION deduct_manual_entry_points()
RETURNS TRIGGER AS $$
DECLARE
  v_points_to_deduct integer;
BEGIN
  -- Only process if this is a manual entry that should deduct points
  IF NEW.admin_adjusted = true AND NEW.deduct_points = true AND NEW.points_deducted = 0 THEN
    -- Get the configured points loss amount
    SELECT manual_entry_points_loss INTO v_points_to_deduct
    FROM points_configuration
    LIMIT 1;

    -- Default to 10 if no configuration exists
    IF v_points_to_deduct IS NULL THEN
      v_points_to_deduct := 10;
    END IF;

    -- Record the points deducted
    NEW.points_deducted := v_points_to_deduct;

    -- Deduct points from the technician's profile
    UPDATE profiles
    SET points_earned = GREATEST(0, points_earned - v_points_to_deduct)
    WHERE id = NEW.technician_id;

    -- Create a points transaction record
    INSERT INTO points_transactions (
      user_id,
      points_amount,
      transaction_type,
      reference_id,
      description
    ) VALUES (
      NEW.technician_id,
      -v_points_to_deduct,
      'admin_adjustment',
      NEW.id,
      'Points deducted for manual time entry: ' || COALESCE(NEW.adjustment_reason, 'No reason provided')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for points deduction
DROP TRIGGER IF EXISTS trigger_deduct_manual_entry_points ON daily_clock_entries;
CREATE TRIGGER trigger_deduct_manual_entry_points
  BEFORE INSERT ON daily_clock_entries
  FOR EACH ROW
  EXECUTE FUNCTION deduct_manual_entry_points();

-- Update existing points_configuration records to have the new field
UPDATE points_configuration
SET manual_entry_points_loss = 10
WHERE manual_entry_points_loss IS NULL;