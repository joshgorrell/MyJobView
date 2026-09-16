/*
# Phase 2: Update write_tax_snapshot to preserve TaxJar result fields

## Purpose
The existing `write_tax_snapshot` function is called by triggers when
proposals are sent/approved, change orders are approved, and invoices are
finalized. It calls `calculate_tax` and inserts a new snapshot row.

When the TaxJar Edge Function has already run `persist_taxjar_result`,
the transaction has authoritative TaxJar data stored on the most recent
snapshot. The new `write_tax_snapshot` call should preserve those TaxJar
fields (rate breakdown, tax_source, freight_taxable, jurisdiction_breakdown,
taxjar_verified_at) rather than leaving them null on the new snapshot.

## Changes
1. Before inserting the new snapshot, check if an existing snapshot for this
   transaction has TaxJar data (taxjar_verified_at IS NOT NULL).
2. If so, copy the TaxJar fields from the prior snapshot to the new insert.
3. The MJV fields (taxability, origin, destination, etc.) are still
   populated from the fresh `calculate_tax` call, ensuring the snapshot
   reflects the current state.
4. The `sales_tax` field is set to the current `tax_amount` on the
   transaction record (which was set by `persist_taxjar_result` to TaxJar's
   `amount_to_collect`).

## What Does NOT Change
- The trigger functions are unchanged.
- The snapshot insert logic is the same, just with additional columns.
- No RLS changes.
- No schema changes.
*/

CREATE OR REPLACE FUNCTION public.write_tax_snapshot(p_transaction_type text, p_transaction_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_calc_result jsonb;
  v_snapshot_id uuid;
  v_org_id uuid;
  v_contact_id uuid;
  v_state text;
  v_environment text;
  v_project_type text;
  v_tax_rate numeric;
  v_material_amount numeric;
  v_labor_amount numeric;
  v_taxable_subtotal numeric;
  v_tax_amount numeric;
  v_origin_result jsonb;
  v_destination_result jsonb;
  v_exemption_ref text;
  v_nexus_status text;
  v_prior_tax_source text;
  v_prior_freight_taxable boolean;
  v_prior_jurisdiction_breakdown jsonb;
  v_prior_taxjar_verified_at timestamptz;
  v_prior_combined_rate numeric;
  v_prior_state_rate numeric;
  v_prior_county_rate numeric;
  v_prior_city_rate numeric;
  v_prior_district_rate numeric;
  v_calc_status text;
BEGIN
  -- Load transaction record
  IF p_transaction_type = 'proposal' THEN
    SELECT organization_id, contact_id, tax_environment, tax_project_type, tax_rate,
           jobsite_state, tax_amount, parts_total, labor_total, tax_calculation_status
    INTO v_org_id, v_contact_id, v_environment, v_project_type, v_tax_rate,
         v_state, v_tax_amount, v_material_amount, v_labor_amount, v_calc_status
    FROM proposals WHERE id = p_transaction_id;
    v_taxable_subtotal := v_material_amount + v_labor_amount;

  ELSIF p_transaction_type = 'change_order' THEN
    SELECT co.organization_id, co.tax_environment, co.tax_project_type, co.tax_rate,
           co.tax_amount, co.subtotal_after_modifiers, co.tax_calculation_status
    INTO v_org_id, v_environment, v_project_type, v_tax_rate,
         v_tax_amount, v_taxable_subtotal, v_calc_status
    FROM change_orders co WHERE co.id = p_transaction_id;

    SELECT p.contact_id, p.jobsite_state
    INTO v_contact_id, v_state
    FROM proposals p JOIN change_orders co ON co.proposal_id = p.id
    WHERE co.id = p_transaction_id;

  ELSIF p_transaction_type = 'invoice' THEN
    SELECT organization_id, contact_id, tax_amount, total, tax_calculation_status
    INTO v_org_id, v_contact_id, v_tax_amount, v_taxable_subtotal, v_calc_status
    FROM invoices WHERE id = p_transaction_id;

    SELECT p.tax_environment, p.tax_project_type, p.tax_rate, p.jobsite_state
    INTO v_environment, v_project_type, v_tax_rate, v_state
    FROM proposals p
    JOIN invoices inv ON (inv.proposal_id = p.id)
    WHERE inv.id = p_transaction_id LIMIT 1;

  ELSE
    RETURN NULL;
  END IF;

  -- Run the orchestrator
  v_calc_result := calculate_tax(p_transaction_type, p_transaction_id);

  -- Extract results
  v_origin_result := v_calc_result->'origin_result';
  v_destination_result := v_calc_result->'destination_result';
  v_exemption_ref := v_calc_result->>'exemption_reference';
  v_nexus_status := v_calc_result->>'collection_status';

  -- Check for prior TaxJar-verified snapshot to preserve TaxJar fields
  SELECT tax_source, freight_taxable, jurisdiction_breakdown, taxjar_verified_at,
         combined_rate, state_rate, county_rate, city_rate, district_rate
  INTO v_prior_tax_source, v_prior_freight_taxable, v_prior_jurisdiction_breakdown,
       v_prior_taxjar_verified_at, v_prior_combined_rate, v_prior_state_rate,
       v_prior_county_rate, v_prior_city_rate, v_prior_district_rate
  FROM tax_snapshots
  WHERE transaction_type = p_transaction_type
    AND transaction_id = p_transaction_id
    AND taxjar_verified_at IS NOT NULL
  ORDER BY calculated_at DESC
  LIMIT 1;

  -- Insert the snapshot
  INSERT INTO tax_snapshots (
    organization_id,
    transaction_type,
    transaction_id,
    contact_id,
    state,
    environment,
    project_type,
    tax_calculation_status,
    taxability_results,
    origin_method,
    origin_office_id,
    origin_address,
    destination_address,
    collection_status,
    nexus_result,
    exemption_reference,
    taxable_subtotal,
    sales_tax,
    combined_rate,
    state_rate,
    county_rate,
    city_rate,
    district_rate,
    tax_source,
    freight_taxable,
    jurisdiction_breakdown,
    taxjar_verified_at,
    calculated_at
  ) VALUES (
    v_org_id,
    p_transaction_type,
    p_transaction_id,
    v_contact_id,
    v_state,
    v_environment,
    v_project_type,
    COALESCE(v_calc_status, v_calc_result->>'tax_calculation_status'),
    v_calc_result->'taxability_results',
    v_origin_result->>'origin_method',
    (v_origin_result->>'office_id')::uuid,
    v_origin_result,
    v_destination_result,
    v_calc_result->>'collection_status',
    v_nexus_status,
    v_exemption_ref,
    COALESCE((v_calc_result->>'taxable_subtotal')::numeric, v_taxable_subtotal),
    v_tax_amount,
    v_prior_combined_rate,
    v_prior_state_rate,
    v_prior_county_rate,
    v_prior_city_rate,
    v_prior_district_rate,
    v_prior_tax_source,
    v_prior_freight_taxable,
    v_prior_jurisdiction_breakdown,
    v_prior_taxjar_verified_at,
    now()
  ) RETURNING id INTO v_snapshot_id;

  -- Update the transaction's snapshot FK
  IF p_transaction_type = 'proposal' THEN
    UPDATE proposals SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
  ELSIF p_transaction_type = 'change_order' THEN
    UPDATE change_orders SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
  ELSIF p_transaction_type = 'invoice' THEN
    UPDATE invoices SET tax_snapshot_id = v_snapshot_id WHERE id = p_transaction_id;
  END IF;

  RETURN v_snapshot_id;
END;
$function$;