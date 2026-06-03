/*
  # Add Lead Claim Time Tracking

  1. Changes
    - Add `time_to_claim_seconds` column to leads table to track how long it took to claim
    - Add `unclaimed_duration_seconds` column to track total time spent unclaimed
    - Create function to calculate and store claim duration when a lead is claimed
  
  2. Purpose
    - Document how long leads are taking to get claimed by sales reps
    - Track performance metrics for lead response times
    - Enable analytics on sales team responsiveness
  
  3. Notes
    - `time_to_claim_seconds` stores the duration from creation to first claim
    - `unclaimed_duration_seconds` tracks total unclaimed time (useful if lead becomes unclaimed again)
    - Calculated automatically via trigger when status changes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'time_to_claim_seconds'
  ) THEN
    ALTER TABLE leads ADD COLUMN time_to_claim_seconds integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'unclaimed_duration_seconds'
  ) THEN
    ALTER TABLE leads ADD COLUMN unclaimed_duration_seconds integer;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION calculate_claim_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('unclaimed', 'fishbowl') AND NEW.status NOT IN ('unclaimed', 'fishbowl') AND NEW.claimed_at IS NOT NULL THEN
    IF OLD.time_to_claim_seconds IS NULL THEN
      NEW.time_to_claim_seconds = EXTRACT(EPOCH FROM (NEW.claimed_at - NEW.created_at))::integer;
    END IF;
    
    IF OLD.claimed_at IS NULL OR OLD.claimed_at <> NEW.claimed_at THEN
      NEW.unclaimed_duration_seconds = COALESCE(OLD.unclaimed_duration_seconds, 0) + 
        EXTRACT(EPOCH FROM (NEW.claimed_at - COALESCE(OLD.claimed_at, NEW.created_at)))::integer;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_claim_duration ON leads;

CREATE TRIGGER trigger_calculate_claim_duration
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION calculate_claim_duration();
