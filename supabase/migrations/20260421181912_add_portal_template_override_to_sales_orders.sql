/*
  # Add portal template override to sales orders

  ## Summary
  This migration enables per-sales-order control over what customers see on the portal.

  ## Changes

  ### Modified Tables
  - `sales_orders`
    - Added `portal_template_override_id` (uuid, nullable) — references proposal_report_templates(id).
      When set, this template is used for the customer portal view of this sales order.
      When null, the view falls back to the linked proposal's report_template_id.

  ## Why
  When a proposal is approved and becomes a sales order, the sales rep should be able to
  adjust the customer portal view (show/hide pricing details, model numbers, area subtotals,
  etc.) without modifying the original proposal. This column stores that per-order override.

  ## Notes
  - ON DELETE SET NULL ensures deleting a template does not break any sales order
  - The application falls back to proposal.report_template_id when this is null
  - The approval trigger will populate this from proposal.report_template_id at creation time
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_orders' AND column_name = 'portal_template_override_id'
  ) THEN
    ALTER TABLE sales_orders
      ADD COLUMN portal_template_override_id uuid
        REFERENCES proposal_report_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_orders_portal_template_override
  ON sales_orders(portal_template_override_id)
  WHERE portal_template_override_id IS NOT NULL;
