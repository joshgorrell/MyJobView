/*
  # Add Proposal Expiration and Renewal System

  1. Schema Changes
    - Add `expires_at` timestamp column to proposals
    - Add `last_renewed_at` timestamp to track renewals
    - Add `renewal_count` to track how many times renewed
    
  2. Auto-Expiration Function
    - Automatically set `expires_at` to 30 days when status changes to 'sent'
    - Auto-update status to 'expired' when expires_at passes
    
  3. Renewal Logic
    - Allow sales reps to renew proposals (extends by 30 days)
    - Track renewal history
    
  4. Portal Integration
    - Customers can only view proposals that are 'sent' and not expired
    - Show expiration countdown on portal
*/

-- Add expiration tracking columns
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE proposals ADD COLUMN expires_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'last_renewed_at'
  ) THEN
    ALTER TABLE proposals ADD COLUMN last_renewed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'renewal_count'
  ) THEN
    ALTER TABLE proposals ADD COLUMN renewal_count integer DEFAULT 0;
  END IF;
END $$;

-- Add 'expired' status if not exists
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_status_check 
  CHECK (status IN ('draft', 'sent', 'approved', 'declined', 'expired'));

-- Function to automatically set expiration when proposal is sent
CREATE OR REPLACE FUNCTION set_proposal_expiration()
RETURNS TRIGGER AS $$
BEGIN
  -- When status changes to 'sent', set expires_at to 30 days from now
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
    NEW.expires_at := NOW() + INTERVAL '30 days';
    NEW.sent_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to set expiration on status change
DROP TRIGGER IF EXISTS trigger_set_proposal_expiration ON proposals;
CREATE TRIGGER trigger_set_proposal_expiration
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION set_proposal_expiration();

-- Function to auto-expire proposals (to be called by cron or manually)
CREATE OR REPLACE FUNCTION expire_old_proposals()
RETURNS void AS $$
BEGIN
  UPDATE proposals
  SET status = 'expired'
  WHERE status = 'sent'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to renew a proposal (extends by 30 days)
CREATE OR REPLACE FUNCTION renew_proposal(proposal_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE proposals
  SET 
    expires_at = NOW() + INTERVAL '30 days',
    last_renewed_at = NOW(),
    renewal_count = COALESCE(renewal_count, 0) + 1,
    status = CASE 
      WHEN status = 'expired' THEN 'sent'
      ELSE status
    END
  WHERE id = proposal_id;
END;
$$ LANGUAGE plpgsql;

-- Update valid_until when expires_at is set (for backwards compatibility)
CREATE OR REPLACE FUNCTION sync_valid_until()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL THEN
    NEW.valid_until := DATE(NEW.expires_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_valid_until ON proposals;
CREATE TRIGGER trigger_sync_valid_until
  BEFORE INSERT OR UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION sync_valid_until();

-- Update existing sent proposals to have expiration dates
UPDATE proposals
SET expires_at = COALESCE(sent_at, created_at) + INTERVAL '30 days'
WHERE status = 'sent' AND expires_at IS NULL;

-- Create index for efficient expiration queries
CREATE INDEX IF NOT EXISTS idx_proposals_expiration 
  ON proposals(status, expires_at) 
  WHERE status = 'sent';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION expire_old_proposals() TO authenticated;
GRANT EXECUTE ON FUNCTION renew_proposal(uuid) TO authenticated;

COMMENT ON COLUMN proposals.expires_at IS 'Timestamp when proposal expires (30 days from sent_at)';
COMMENT ON COLUMN proposals.last_renewed_at IS 'Last time the proposal was renewed by a rep';
COMMENT ON COLUMN proposals.renewal_count IS 'Number of times this proposal has been renewed';
COMMENT ON FUNCTION renew_proposal(uuid) IS 'Extends proposal expiration by 30 days and increments renewal count';
COMMENT ON FUNCTION expire_old_proposals() IS 'Automatically marks expired proposals - should be run daily via cron';
