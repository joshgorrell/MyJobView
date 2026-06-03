/*
  # Proposal Status & Decline Tracking Improvements

  ## Changes

  ### 1. Add 'cancelled' to proposals status constraint
  - Adds a new 'cancelled' status distinct from 'declined'
  - Cancelled = company/rep decided not to pursue
  - Declined = customer said no

  ### 2. Add decline tracking columns
  - `decline_reason` (text) — structured reason code for why proposal was declined/cancelled
  - `decline_notes` (text) — free-text notes captured at time of decline

  ### 3. Auto-update updated_at trigger
  - Adds a trigger on the proposals table to automatically set updated_at = now()
    on every UPDATE, ensuring stale detection is always accurate regardless of
    which frontend path made the change.

  ### 4. Bubble up updated_at from line item changes
  - Trigger on proposal_line_items to touch proposals.updated_at whenever a line
    item is inserted, updated, or deleted — so adding/removing items resets the
    stale clock.

  ## Security
  - No RLS changes needed; these are column additions and triggers only
*/

-- 1. Update status check constraint to include 'cancelled'
DO $$
BEGIN
  -- Drop existing constraint if it exists (may have various names)
  ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
  ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check1;
  ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_fkey;
END $$;

ALTER TABLE proposals ADD CONSTRAINT proposals_status_check
  CHECK (status IN (
    'designing',
    'ready_to_submit',
    'sent',
    'viewed',
    'portal',
    'approved',
    'approved_pending_action',
    'declined',
    'cancelled',
    'expired',
    'archived'
  ));

-- 2. Add decline tracking columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'decline_reason'
  ) THEN
    ALTER TABLE proposals ADD COLUMN decline_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'decline_notes'
  ) THEN
    ALTER TABLE proposals ADD COLUMN decline_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'declined_at'
  ) THEN
    ALTER TABLE proposals ADD COLUMN declined_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'declined_by'
  ) THEN
    ALTER TABLE proposals ADD COLUMN declined_by text DEFAULT 'customer' CHECK (declined_by IN ('customer', 'rep', 'company'));
  END IF;
END $$;

-- 3. Auto-update updated_at trigger on proposals
CREATE OR REPLACE FUNCTION touch_proposals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposals_updated_at_trigger ON proposals;
CREATE TRIGGER proposals_updated_at_trigger
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION touch_proposals_updated_at();

-- 4. Bubble up line item changes to parent proposal updated_at
CREATE OR REPLACE FUNCTION touch_proposal_on_line_item_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
BEGIN
  -- Get the proposal_id from the affected row
  IF TG_OP = 'DELETE' THEN
    v_proposal_id := OLD.proposal_id;
  ELSE
    v_proposal_id := NEW.proposal_id;
  END IF;

  -- Only proceed if we have a proposal_id
  IF v_proposal_id IS NOT NULL THEN
    UPDATE proposals
    SET updated_at = now()
    WHERE id = v_proposal_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposal_line_items_touch_proposal ON proposal_line_items;
CREATE TRIGGER proposal_line_items_touch_proposal
  AFTER INSERT OR UPDATE OR DELETE ON proposal_line_items
  FOR EACH ROW
  EXECUTE FUNCTION touch_proposal_on_line_item_change();
