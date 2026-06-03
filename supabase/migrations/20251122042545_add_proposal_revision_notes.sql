/*
  # Add Proposal Revision Notes

  1. Schema Changes
    - Add `revision_notes` text column to proposals
    - Add `revision_history` jsonb column to track all revisions
    
  2. Purpose
    - Store customer-facing revision notes when proposals are resubmitted
    - Track history of all revisions and resubmissions
    - Display at top of proposal when customer views it
*/

-- Add revision notes columns
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'revision_notes'
  ) THEN
    ALTER TABLE proposals ADD COLUMN revision_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'revision_history'
  ) THEN
    ALTER TABLE proposals ADD COLUMN revision_history jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Function to add revision entry when proposal is resubmitted
CREATE OR REPLACE FUNCTION add_revision_entry()
RETURNS TRIGGER AS $$
BEGIN
  -- If proposal is being renewed and has revision notes, add to history
  IF NEW.renewal_count > OLD.renewal_count AND NEW.revision_notes IS NOT NULL AND NEW.revision_notes != '' THEN
    NEW.revision_history := COALESCE(OLD.revision_history, '[]'::jsonb) || 
      jsonb_build_object(
        'revision_number', NEW.renewal_count,
        'notes', NEW.revision_notes,
        'resubmitted_at', NOW(),
        'resubmitted_by', auth.uid()
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to track revision history
DROP TRIGGER IF EXISTS trigger_add_revision_entry ON proposals;
CREATE TRIGGER trigger_add_revision_entry
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION add_revision_entry();

COMMENT ON COLUMN proposals.revision_notes IS 'Customer-facing notes explaining changes when proposal is resubmitted';
COMMENT ON COLUMN proposals.revision_history IS 'JSON array tracking all revisions: [{revision_number, notes, resubmitted_at, resubmitted_by}]';
