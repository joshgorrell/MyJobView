/*
  # Work Order Billing and Archiving System

  ## Summary
  Adds comprehensive billing tracking and archiving capabilities to work orders:
  - Billable flag to indicate if work order should be billed
  - Archive status for completed and billed work orders
  - Filters and indexes for efficient querying
  - Default billable=true for service type work orders

  ## Schema Changes

  ### work_orders table modifications:
  - Add `is_billable` - Whether this work order should be billed (default true for service type)
  - Add `is_archived` - Whether this work order has been completed and billed (archived)
  - Add `archived_at` - Timestamp when work order was archived
  - Add `archived_by` - User who archived the work order
  - Add `billing_notes` - Internal notes about billing this work order

  ## Indexes
  - Index on is_billable for service billing queue filtering
  - Index on is_archived for filtering archived vs active work orders
  - Composite index on type, is_billable, is_archived for efficient queries

  ## Notes
  - Service work orders default to billable=true
  - Work orders can be linked via work_order_group_id (already exists)
  - Archived work orders are hidden by default but still accessible
  - Archive status indicates work is complete AND billing is complete
*/

-- Add billable and archiving columns to work_orders
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS is_billable boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_notes text;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_work_orders_is_billable ON work_orders(is_billable) WHERE is_billable = true;
CREATE INDEX IF NOT EXISTS idx_work_orders_is_archived ON work_orders(is_archived) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_work_orders_billing_queue ON work_orders(type, is_billable, is_archived, status)
  WHERE is_billable = true AND is_archived = false;

-- Add comments for documentation
COMMENT ON COLUMN work_orders.is_billable IS 'Whether this work order should be billed to the customer. Service work orders default to true.';
COMMENT ON COLUMN work_orders.is_archived IS 'Whether this work order has been completed and billed. Archived work orders are hidden from active queues but remain accessible.';
COMMENT ON COLUMN work_orders.work_order_group_id IS 'Links related work orders together for multi-tech or multi-day jobs. All work orders in a group can be billed together.';
COMMENT ON COLUMN work_orders.billing_notes IS 'Internal notes about billing this work order (e.g., special pricing, discounts, billing instructions)';

-- Set existing service work orders to billable by default
UPDATE work_orders
SET is_billable = true
WHERE type = 'service' AND is_billable IS NULL;

-- Function to archive a work order (marks as archived with timestamp and user)
CREATE OR REPLACE FUNCTION archive_work_order(
  p_work_order_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE work_orders
  SET
    is_archived = true,
    archived_at = now(),
    archived_by = p_user_id
  WHERE id = p_work_order_id;
END;
$$;

-- Function to unarchive a work order
CREATE OR REPLACE FUNCTION unarchive_work_order(
  p_work_order_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE work_orders
  SET
    is_archived = false,
    archived_at = NULL,
    archived_by = NULL
  WHERE id = p_work_order_id;
END;
$$;

-- Function to get all work orders in a group (for billing linked work orders together)
CREATE OR REPLACE FUNCTION get_work_order_group_summary(p_group_id uuid)
RETURNS TABLE (
  work_order_count int,
  total_estimated_hours numeric,
  total_actual_hours numeric,
  completion_status text,
  all_completed boolean,
  all_billable boolean,
  group_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::int as work_order_count,
    SUM(estimated_hours) as total_estimated_hours,
    SUM(actual_hours) as total_actual_hours,
    CASE
      WHEN COUNT(*) = COUNT(*) FILTER (WHERE status = 'completed') THEN 'all_completed'
      WHEN COUNT(*) FILTER (WHERE status = 'completed') > 0 THEN 'partially_completed'
      ELSE 'not_started'
    END as completion_status,
    (COUNT(*) = COUNT(*) FILTER (WHERE status = 'completed')) as all_completed,
    (COUNT(*) = COUNT(*) FILTER (WHERE is_billable = true)) as all_billable,
    p_group_id as group_id
  FROM work_orders
  WHERE work_order_group_id = p_group_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION archive_work_order TO authenticated;
GRANT EXECUTE ON FUNCTION unarchive_work_order TO authenticated;
GRANT EXECUTE ON FUNCTION get_work_order_group_summary TO authenticated;
