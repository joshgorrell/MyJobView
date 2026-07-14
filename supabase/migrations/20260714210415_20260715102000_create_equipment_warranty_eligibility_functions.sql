/*
# Equipment Warranty Eligibility Functions

## Summary
Creates two SQL functions to determine what products a customer has purchased
and whether a specific product is eligible for an equipment extended warranty
(must be less than 15 months old based on install/completion date).

## Functions

### get_customer_purchased_equipment(p_contact_id uuid)
Returns a table of products the customer has purchased, with the best available
date for determining equipment age. The date hierarchy is:
1. projects.actual_completion_date (best proxy for "installed date")
2. sales_orders.first_completion_date
3. sales_orders.created_at (fallback)

Joins: contacts -> proposals -> proposal_line_items (product_id -> products)
       -> sales_orders -> projects (LEFT JOIN)

Only returns rows where product_id IS NOT NULL (excludes custom line items).
Only returns material-type products (item_type = 'material') since warranties
apply to physical equipment, not labor line items.

### is_equipment_warranty_eligible(p_product_id uuid, p_contact_id uuid)
Returns boolean. Calls get_customer_purchased_equipment, finds matching product,
checks that the best available date is less than 15 months ago.

## Security
Both functions are SECURITY DEFINER (run with elevated privileges to join across
tables that may have RLS). EXECUTE granted to authenticated role only.

## Important Notes
1. The 15-month eligibility window is hardcoded as 15 months from now.
2. If no date is available at all (all three date columns are NULL), the equipment
   is considered NOT eligible (conservative default).
3. If the product appears on multiple proposals/orders, the most recent date is used.
*/

-- Drop existing functions if they exist (for idempotency)
DROP FUNCTION IF EXISTS get_customer_purchased_equipment(uuid);
DROP FUNCTION IF EXISTS is_equipment_warranty_eligible(uuid, uuid);

-- Create get_customer_purchased_equipment function
CREATE OR REPLACE FUNCTION get_customer_purchased_equipment(p_contact_id uuid)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  manufacturer text,
  model_number text,
  sku text,
  category text,
  quantity numeric,
  unit_price numeric,
  line_total numeric,
  proposal_id uuid,
  sales_order_id uuid,
  project_id uuid,
  purchase_date date,
  age_months integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.manufacturer,
    p.model_number,
    p.sku,
    p.category,
    pli.quantity,
    pli.unit_price,
    pli.line_total,
    prop.id AS proposal_id,
    so.id AS sales_order_id,
    proj.id AS project_id,
    COALESCE(
      proj.actual_completion_date::date,
      so.first_completion_date::date,
      so.created_at::date
    ) AS purchase_date,
    CASE
      WHEN COALESCE(
        proj.actual_completion_date::date,
        so.first_completion_date::date,
        so.created_at::date
      ) IS NOT NULL
      THEN EXTRACT(YEAR FROM age(now(), COALESCE(
        proj.actual_completion_date::date,
        so.first_completion_date::date,
        so.created_at::date
      )))::integer * 12 + EXTRACT(MONTH FROM age(now(), COALESCE(
        proj.actual_completion_date::date,
        so.first_completion_date::date,
        so.created_at::date
      )))::integer
      ELSE NULL
    END AS age_months
  FROM proposals prop
  INNER JOIN proposal_line_items pli ON pli.proposal_id = prop.id
  LEFT JOIN products p ON p.id = pli.product_id
  LEFT JOIN sales_orders so ON so.proposal_id = prop.id
  LEFT JOIN projects proj ON proj.sales_order_id = so.id
  WHERE prop.contact_id = p_contact_id
    AND pli.product_id IS NOT NULL
    AND p.item_type = 'material'
    AND pli.is_hidden = false
  ORDER BY COALESCE(
    proj.actual_completion_date::date,
    so.first_completion_date::date,
    so.created_at::date
  ) DESC NULLS LAST;
END;
$$;

-- Grant execute to authenticated only
REVOKE ALL ON FUNCTION get_customer_purchased_equipment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_customer_purchased_equipment(uuid) TO authenticated;

-- Create is_equipment_warranty_eligible function
CREATE OR REPLACE FUNCTION is_equipment_warranty_eligible(p_product_id uuid, p_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_date date;
BEGIN
  SELECT purchase_date
  INTO v_purchase_date
  FROM get_customer_purchased_equipment(p_contact_id)
  WHERE product_id = p_product_id
  ORDER BY purchase_date DESC NULLS LAST
  LIMIT 1;

  -- If no purchase date found, not eligible (conservative default)
  IF v_purchase_date IS NULL THEN
    RETURN false;
  END IF;

  -- Eligible if purchase date is less than 15 months ago
  RETURN v_purchase_date > (now() - interval '15 months')::date;
END;
$$;

-- Grant execute to authenticated only
REVOKE ALL ON FUNCTION is_equipment_warranty_eligible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_equipment_warranty_eligible(uuid, uuid) TO authenticated;
