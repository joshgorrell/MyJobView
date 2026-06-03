/*
  # Add Scope of Work Tracking and Proposal Change Detection

  1. Changes to `proposal_settings`
    - Add `scope_of_work_updated_at` (timestamptz) - Tracks when scope of work was last modified
    - Add `proposal_items_hash` (text) - Hash of proposal line items to detect changes

  2. Function
    - Create trigger to update scope_of_work_updated_at when scope_of_work changes
    - Create function to calculate proposal items hash

  3. Security
    - No RLS changes needed (inherits from table)
*/

-- Add columns to proposal_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'scope_of_work_updated_at'
  ) THEN
    ALTER TABLE proposal_settings
    ADD COLUMN scope_of_work_updated_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'proposal_items_hash'
  ) THEN
    ALTER TABLE proposal_settings
    ADD COLUMN proposal_items_hash text;
  END IF;
END $$;

-- Trigger function to update scope_of_work_updated_at
CREATE OR REPLACE FUNCTION update_scope_of_work_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.scope_of_work IS DISTINCT FROM OLD.scope_of_work) THEN
    NEW.scope_of_work_updated_at = now();
  ELSIF (TG_OP = 'INSERT' AND NEW.scope_of_work IS NOT NULL AND NEW.scope_of_work != '') THEN
    NEW.scope_of_work_updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_scope_of_work_timestamp ON proposal_settings;

CREATE TRIGGER trigger_update_scope_of_work_timestamp
  BEFORE INSERT OR UPDATE ON proposal_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_scope_of_work_timestamp();

-- Function to calculate hash of proposal line items
CREATE OR REPLACE FUNCTION calculate_proposal_items_hash(p_proposal_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  items_data text;
BEGIN
  SELECT string_agg(
    concat_ws('|',
      pli.id,
      pli.description,
      pli.quantity,
      pli.unit_price,
      pli.labor_hours,
      pli.updated_at
    ),
    ','
    ORDER BY pli.created_at, pli.id
  ) INTO items_data
  FROM proposal_line_items pli
  WHERE pli.proposal_id = p_proposal_id;

  -- Return MD5 hash of the concatenated items data
  RETURN md5(COALESCE(items_data, ''));
END;
$$;

-- Trigger function to update proposal_items_hash when line items change
CREATE OR REPLACE FUNCTION update_proposal_items_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_hash text;
  proposal_id_to_update uuid;
BEGIN
  -- Determine which proposal_id to update
  IF TG_OP = 'DELETE' THEN
    proposal_id_to_update := OLD.proposal_id;
  ELSE
    proposal_id_to_update := NEW.proposal_id;
  END IF;

  -- Calculate new hash
  new_hash := calculate_proposal_items_hash(proposal_id_to_update);

  -- Update proposal_settings with new hash
  UPDATE proposal_settings
  SET proposal_items_hash = new_hash
  WHERE proposal_id = proposal_id_to_update;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_proposal_items_hash ON proposal_line_items;

CREATE TRIGGER trigger_update_proposal_items_hash
  AFTER INSERT OR UPDATE OR DELETE ON proposal_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_proposal_items_hash();

-- Initialize hash for existing proposals
UPDATE proposal_settings ps
SET proposal_items_hash = calculate_proposal_items_hash(ps.proposal_id)
WHERE proposal_items_hash IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_proposal_settings_scope_updated ON proposal_settings(scope_of_work_updated_at);