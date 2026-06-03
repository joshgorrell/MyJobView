/*
  # Create Proposal Archiving System

  1. Schema Changes
    - Add 'archived' status to proposals
    - Add archived_at, archived_by, auto_archived tracking columns
    - Create proposal_archive_log table for auto-archive tracking
    - Add auto-archive settings to company_settings
    - Create indexes for performance

  2. Security
    - RLS policies already cover archived proposals through existing status checks
    - Archive log table accessible to admin users only

  3. Functions
    - analyze_proposal_pricing(): Analyzes pricing changes and discontinued products
    - update_proposal_pricing(): Updates line item pricing to current catalog prices
    - auto_archive_declined_proposals(): Batch archives old declined proposals
*/

-- Update proposals status check constraint to include 'archived'
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_status_check
  CHECK (status IN ('designing', 'ready_to_submit', 'sent', 'viewed', 'approved', 'approved_pending_action', 'expired', 'declined', 'archived'));

-- Add tracking columns to proposals table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE proposals ADD COLUMN archived_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'archived_by'
  ) THEN
    ALTER TABLE proposals ADD COLUMN archived_by uuid REFERENCES profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'auto_archived'
  ) THEN
    ALTER TABLE proposals ADD COLUMN auto_archived boolean DEFAULT false;
  END IF;
END $$;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_proposals_status_updated_at
  ON proposals(status, updated_at)
  WHERE status IN ('declined', 'archived');

CREATE INDEX IF NOT EXISTS idx_proposals_archived_at
  ON proposals(archived_at)
  WHERE archived_at IS NOT NULL;

-- Create proposal archive log table
CREATE TABLE IF NOT EXISTS proposal_archive_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at timestamptz DEFAULT now() NOT NULL,
  proposals_archived integer DEFAULT 0,
  proposal_ids uuid[] DEFAULT '{}',
  success boolean DEFAULT true,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE proposal_archive_log ENABLE ROW LEVEL SECURITY;

-- Archive log policies - admin only
CREATE POLICY "Admins can view archive logs"
  ON proposal_archive_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Add auto-archive settings to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'auto_archive_declined_proposals_enabled'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN auto_archive_declined_proposals_enabled boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'auto_archive_declined_after_days'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN auto_archive_declined_after_days integer DEFAULT 90;
  END IF;
END $$;

-- Function to analyze proposal pricing changes
CREATE OR REPLACE FUNCTION analyze_proposal_pricing(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_discontinued_items jsonb;
  v_pricing_changed_items jsonb;
  v_pricing_unchanged_items jsonb;
  v_old_total numeric;
  v_new_total numeric;
BEGIN
  -- Get discontinued items (product not active)
  SELECT jsonb_agg(jsonb_build_object(
    'line_item_id', pli.id,
    'product_id', pli.product_id,
    'description', pli.description,
    'quantity', pli.quantity,
    'unit_price', pli.unit_price,
    'cost', pli.cost,
    'line_total', pli.line_total,
    'product_name', p.name
  ))
  INTO v_discontinued_items
  FROM proposal_line_items pli
  JOIN products p ON p.id = pli.product_id
  WHERE pli.proposal_id = p_proposal_id
    AND pli.product_id IS NOT NULL
    AND pli.is_custom = false
    AND p.is_active = false;

  -- Get pricing changed items (current price differs from line item)
  SELECT jsonb_agg(jsonb_build_object(
    'line_item_id', pli.id,
    'product_id', pli.product_id,
    'description', pli.description,
    'quantity', pli.quantity,
    'old_unit_price', pli.unit_price,
    'new_unit_price', p.unit_price,
    'old_cost', pli.cost,
    'new_cost', p.cost,
    'old_line_total', pli.line_total,
    'new_line_total', pli.quantity * p.unit_price,
    'price_difference', p.unit_price - pli.unit_price,
    'line_difference', (pli.quantity * p.unit_price) - pli.line_total,
    'product_name', p.name
  ))
  INTO v_pricing_changed_items
  FROM proposal_line_items pli
  JOIN products p ON p.id = pli.product_id
  WHERE pli.proposal_id = p_proposal_id
    AND pli.product_id IS NOT NULL
    AND pli.is_custom = false
    AND p.is_active = true
    AND (p.unit_price != pli.unit_price OR p.cost != pli.cost);

  -- Get pricing unchanged items
  SELECT jsonb_agg(jsonb_build_object(
    'line_item_id', pli.id,
    'product_id', pli.product_id,
    'description', pli.description,
    'quantity', pli.quantity,
    'unit_price', pli.unit_price,
    'cost', pli.cost,
    'line_total', pli.line_total,
    'product_name', p.name
  ))
  INTO v_pricing_unchanged_items
  FROM proposal_line_items pli
  JOIN products p ON p.id = pli.product_id
  WHERE pli.proposal_id = p_proposal_id
    AND pli.product_id IS NOT NULL
    AND pli.is_custom = false
    AND p.is_active = true
    AND p.unit_price = pli.unit_price
    AND p.cost = pli.cost;

  -- Calculate old and new totals
  SELECT
    COALESCE(SUM(pli.line_total), 0),
    COALESCE(SUM(
      CASE
        WHEN p.is_active = true THEN pli.quantity * p.unit_price
        ELSE pli.line_total
      END
    ), 0)
  INTO v_old_total, v_new_total
  FROM proposal_line_items pli
  LEFT JOIN products p ON p.id = pli.product_id
  WHERE pli.proposal_id = p_proposal_id
    AND pli.product_id IS NOT NULL
    AND pli.is_custom = false;

  -- Build result
  v_result := jsonb_build_object(
    'discontinued_items', COALESCE(v_discontinued_items, '[]'::jsonb),
    'pricing_changed_items', COALESCE(v_pricing_changed_items, '[]'::jsonb),
    'pricing_unchanged_items', COALESCE(v_pricing_unchanged_items, '[]'::jsonb),
    'summary', jsonb_build_object(
      'old_total', v_old_total,
      'new_total', v_new_total,
      'difference', v_new_total - v_old_total,
      'has_discontinued', v_discontinued_items IS NOT NULL AND jsonb_array_length(v_discontinued_items) > 0,
      'has_pricing_changes', v_pricing_changed_items IS NOT NULL AND jsonb_array_length(v_pricing_changed_items) > 0
    )
  );

  RETURN v_result;
END;
$$;

-- Function to update proposal pricing to current catalog prices
CREATE OR REPLACE FUNCTION update_proposal_pricing(
  p_proposal_id uuid,
  p_update_pricing boolean DEFAULT true,
  p_convert_discontinued_to_custom boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count integer := 0;
  v_converted_count integer := 0;
  v_new_subtotal numeric := 0;
  v_proposal record;
  v_result jsonb;
BEGIN
  -- Get proposal details
  SELECT * INTO v_proposal FROM proposals WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  -- Update pricing for active products if requested
  IF p_update_pricing THEN
    UPDATE proposal_line_items pli
    SET
      unit_price = p.unit_price,
      cost = p.cost,
      line_total = pli.quantity * p.unit_price,
      updated_at = now()
    FROM products p
    WHERE pli.proposal_id = p_proposal_id
      AND pli.product_id = p.id
      AND pli.is_custom = false
      AND p.is_active = true;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  END IF;

  -- Convert discontinued products to custom items if requested
  IF p_convert_discontinued_to_custom THEN
    UPDATE proposal_line_items pli
    SET
      is_custom = true,
      product_id = NULL,
      updated_at = now()
    FROM products p
    WHERE pli.proposal_id = p_proposal_id
      AND pli.product_id = p.id
      AND pli.is_custom = false
      AND p.is_active = false;

    GET DIAGNOSTICS v_converted_count = ROW_COUNT;
  END IF;

  -- Recalculate proposal totals
  SELECT COALESCE(SUM(line_total), 0)
  INTO v_new_subtotal
  FROM proposal_line_items
  WHERE proposal_id = p_proposal_id;

  -- Update proposal with new totals
  UPDATE proposals
  SET
    subtotal = v_new_subtotal,
    tax_amount = v_new_subtotal * COALESCE(tax_rate, 0),
    total = v_new_subtotal + (v_new_subtotal * COALESCE(tax_rate, 0)),
    updated_at = now()
  WHERE id = p_proposal_id;

  -- Build result
  v_result := jsonb_build_object(
    'updated_count', v_updated_count,
    'converted_count', v_converted_count,
    'new_subtotal', v_new_subtotal,
    'success', true
  );

  RETURN v_result;
END;
$$;

-- Function to auto-archive old declined proposals
CREATE OR REPLACE FUNCTION auto_archive_declined_proposals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days_threshold integer;
  v_enabled boolean;
  v_cutoff_date timestamptz;
  v_proposal_ids uuid[];
  v_archived_count integer := 0;
  v_result jsonb;
BEGIN
  -- Get company settings
  SELECT
    COALESCE(auto_archive_declined_proposals_enabled, true),
    COALESCE(auto_archive_declined_after_days, 90)
  INTO v_enabled, v_days_threshold
  FROM company_settings
  LIMIT 1;

  -- Exit if auto-archive is disabled
  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'success', true,
      'archived_count', 0,
      'message', 'Auto-archive is disabled'
    );
  END IF;

  -- Calculate cutoff date
  v_cutoff_date := now() - (v_days_threshold || ' days')::interval;

  -- Get proposals to archive
  SELECT array_agg(id)
  INTO v_proposal_ids
  FROM proposals
  WHERE status = 'declined'
    AND updated_at < v_cutoff_date;

  -- Archive proposals
  IF v_proposal_ids IS NOT NULL THEN
    UPDATE proposals
    SET
      status = 'archived',
      archived_at = now(),
      auto_archived = true,
      updated_at = now()
    WHERE id = ANY(v_proposal_ids);

    GET DIAGNOSTICS v_archived_count = ROW_COUNT;
  END IF;

  -- Log execution
  INSERT INTO proposal_archive_log (
    executed_at,
    proposals_archived,
    proposal_ids,
    success
  ) VALUES (
    now(),
    v_archived_count,
    COALESCE(v_proposal_ids, '{}'),
    true
  );

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'archived_count', v_archived_count,
    'proposal_ids', COALESCE(v_proposal_ids, '[]'::uuid[]),
    'cutoff_date', v_cutoff_date
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error
    INSERT INTO proposal_archive_log (
      executed_at,
      proposals_archived,
      success,
      error_message
    ) VALUES (
      now(),
      0,
      false,
      SQLERRM
    );

    RAISE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION analyze_proposal_pricing TO authenticated;
GRANT EXECUTE ON FUNCTION update_proposal_pricing TO authenticated;
GRANT EXECUTE ON FUNCTION auto_archive_declined_proposals TO service_role;