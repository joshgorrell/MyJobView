/*
# Rewrite generate_recurring_invoices for Combined Multi-Agreement Billing

## Summary
Replaces the existing generate_recurring_invoices() function with a new
version that groups all due subscriptions for a contact into ONE combined
invoice per billing cycle, with one line item per agreement. Applies the
annual billing discount when the customer's billing preference is 'annual'.

## Key Changes
1. Groups due subscriptions by contact_id instead of processing one-by-one.
2. Reads the customer's billing preference via get_customer_billing_preference().
3. For MONTHLY preference: creates one invoice per contact with all due
   agreements as line items. Each line item = one month of that agreement.
4. For ANNUAL preference: creates one invoice per contact with all due
   agreements as line items, where each line item = 12 months of that agreement.
   Then applies the annual discount (percentage or flat) as a separate line item.
5. Advances each subscription's next_billing_date independently based on
   the customer's billing preference (monthly → +1 month, annual → +1 year).
6. Preserves per-agreement renewal independence.

## Annual Discount Calculation
- Reads annual_discount_type, annual_discount_percentage, annual_discount_flat_amount
  from company_settings.
- 'percentage': discount = annual_subtotal * (percentage / 100)
- 'flat': discount = flat_amount
- 'none': discount = 0
- The discount appears as a negative line item on the invoice.

## Invoice Structure
- One invoice per contact per billing run.
- Line items: one per due subscription, description includes plan name.
- For annual: one additional line item for the discount (negative amount).
- Invoice subtotal = sum of all line items (including discount).
- Tax is calculated on the pre-discount subtotal.

## Backward Compatibility
- Subscriptions without a contact_id are processed individually (legacy mode).
- If no billing preference exists, defaults to monthly.

## Security
- SECURITY DEFINER, search_path = public.
- EXECUTE revoked from PUBLIC and anon.
*/

DROP FUNCTION IF EXISTS generate_recurring_invoices();

CREATE OR REPLACE FUNCTION generate_recurring_invoices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_generated integer := 0;
  v_failed integer := 0;
  v_errors text[] := ARRAY[]::text[];
  v_contact RECORD;
  v_sub RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_billing_amount numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_total numeric;
  v_subtotal numeric;
  v_discount numeric := 0;
  v_period_start date;
  v_period_end date;
  v_next_date date;
  v_ri_id uuid;
  v_pref text;
  v_annual_enabled boolean;
  v_disc_type text;
  v_disc_pct numeric;
  v_disc_flat numeric;
  v_line_sort integer := 1;
  v_line_amount numeric;
  v_is_annual boolean;
  v_org_id uuid;
  v_office_id uuid;
  v_contact_name text;
  v_contact_email text;
  v_contact_tax_rate numeric;
  v_is_tax_exempt boolean;
  v_tax_environment text;
  v_tax_jurisdiction_id uuid;
  v_grace_days integer;
BEGIN
  -- Load company billing settings
  SELECT
    annual_billing_enabled,
    annual_discount_type,
    annual_discount_percentage,
    annual_discount_flat_amount,
    grace_period_days
  INTO
    v_annual_enabled,
    v_disc_type,
    v_disc_pct,
    v_disc_flat,
    v_grace_days
  FROM company_settings
  LIMIT 1;

  v_disc_type := COALESCE(v_disc_type, 'none');
  v_disc_pct := COALESCE(v_disc_pct, 0);
  v_disc_flat := COALESCE(v_disc_flat, 0);
  v_grace_days := COALESCE(v_grace_days, 0);

  -- Process subscriptions grouped by contact
  FOR v_contact IN
    SELECT DISTINCT rs.contact_id
    FROM recurring_subscriptions rs
    WHERE rs.status = 'active'
      AND rs.auto_invoice = true
      AND rs.next_billing_date <= CURRENT_DATE
      AND rs.contact_id IS NOT NULL
  LOOP
    BEGIN
      -- Get the contact's billing preference
      v_pref := get_customer_billing_preference(v_contact.contact_id);
      v_is_annual := (v_pref = 'annual' AND COALESCE(v_annual_enabled, false) = true);

      -- Get contact details
      SELECT organization_id, office_id, full_name, email, tax_rate, is_tax_exempt, tax_environment, tax_jurisdiction_id
      INTO v_org_id, v_office_id, v_contact_name, v_contact_email, v_contact_tax_rate, v_is_tax_exempt, v_tax_environment, v_tax_jurisdiction_id
      FROM contacts
      WHERE id = v_contact.contact_id;

      v_org_id := COALESCE(v_org_id, public.get_user_org_id());
      v_tax_environment := COALESCE(v_tax_environment, 'residential');

      -- Calculate billing period
      v_period_start := CURRENT_DATE;
      IF v_is_annual THEN
        v_period_end := (CURRENT_DATE + INTERVAL '1 year' - INTERVAL '1 day')::date;
      ELSE
        v_period_end := (CURRENT_DATE + INTERVAL '1 month' - INTERVAL '1 day')::date;
      END IF;

      -- Generate invoice number
      v_invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(
        (COALESCE(
          (SELECT MAX(CAST(SUBSTRING(invoice_number FROM 11) AS integer))
           FROM invoices
           WHERE invoice_number LIKE 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%')
        , 0) + 1)::text, 5, '0'
      );

      -- Calculate subtotal from all due subscriptions for this contact
      v_subtotal := 0;
      v_line_sort := 1;

      -- First pass: calculate subtotal for discount calculation
      FOR v_sub IN
        SELECT rs.id, rs.custom_amount, rs.next_billing_date, rs.billing_day,
               rp.id as plan_id, rp.plan_name, rp.billing_frequency,
               rp.amount as plan_amount, rp.tax_rate as plan_tax_rate
        FROM recurring_subscriptions rs
        LEFT JOIN recurring_plans rp ON rp.id = rs.plan_id
        WHERE rs.contact_id = v_contact.contact_id
          AND rs.status = 'active'
          AND rs.auto_invoice = true
          AND rs.next_billing_date <= CURRENT_DATE
      LOOP
        v_billing_amount := COALESCE(v_sub.custom_amount, v_sub.plan_amount, 0);
        IF v_billing_amount <= 0 THEN
          CONTINUE;
        END IF;

        IF v_is_annual THEN
          -- Annual: 12 months worth
          v_line_amount := v_billing_amount * 12;
        ELSE
          -- Monthly: 1 month
          v_line_amount := v_billing_amount;
        END IF;

        v_subtotal := v_subtotal + v_line_amount;
      END LOOP;

      IF v_subtotal <= 0 THEN
        v_failed := v_failed + 1;
        v_errors := array_append(v_errors, 'Contact ' || v_contact.contact_id::text || ': no billable subscriptions');
        CONTINUE;
      END IF;

      -- Calculate discount
      IF v_is_annual THEN
        IF v_disc_type = 'percentage' THEN
          v_discount := ROUND(v_subtotal * v_disc_pct / 100, 2);
        ELSIF v_disc_type = 'flat' THEN
          v_discount := LEAST(v_disc_flat, v_subtotal);
        ELSE
          v_discount := 0;
        END IF;
      ELSE
        v_discount := 0;
      END IF;

      -- Calculate tax on pre-discount subtotal
      v_tax_rate := COALESCE(v_contact_tax_rate, 0);
      IF COALESCE(v_is_tax_exempt, false) = true THEN
        v_tax_rate := 0;
      END IF;
      v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
      v_total := (v_subtotal - v_discount) + v_tax_amount;

      -- Create the invoice
      INSERT INTO invoices (
        organization_id, company_id, invoice_number, contact_id,
        invoice_date, due_date, subtotal, tax_amount, total,
        amount_paid, amount_due, status,
        tax_rate, tax_environment, tax_jurisdiction_id,
        tax_project_type, source_type, invoice_type, office_id,
        created_by, created_by_name
      ) VALUES (
        v_org_id,
        v_org_id,
        v_invoice_number,
        v_contact.contact_id,
        CURRENT_DATE,
        CURRENT_DATE + 10,
        v_subtotal - v_discount,
        v_tax_amount,
        v_total,
        0,
        v_total,
        'sent',
        v_tax_rate,
        v_tax_environment,
        v_tax_jurisdiction_id,
        'general_installation_repair',
        'recurring',
        'recurring',
        v_office_id,
        v_org_id,
        'Recurring Billing System'
      ) RETURNING id INTO v_invoice_id;

      -- Second pass: create line items
      v_line_sort := 1;
      FOR v_sub IN
        SELECT rs.id, rs.custom_amount, rs.next_billing_date, rs.billing_day,
               rp.id as plan_id, rp.plan_name, rp.billing_frequency,
               rp.amount as plan_amount, rp.tax_rate as plan_tax_rate
        FROM recurring_subscriptions rs
        LEFT JOIN recurring_plans rp ON rp.id = rs.plan_id
        WHERE rs.contact_id = v_contact.contact_id
          AND rs.status = 'active'
          AND rs.auto_invoice = true
          AND rs.next_billing_date <= CURRENT_DATE
      LOOP
        v_billing_amount := COALESCE(v_sub.custom_amount, v_sub.plan_amount, 0);
        IF v_billing_amount <= 0 THEN
          CONTINUE;
        END IF;

        IF v_is_annual THEN
          v_line_amount := v_billing_amount * 12;
        ELSE
          v_line_amount := v_billing_amount;
        END IF;

        INSERT INTO invoice_line_items (
          invoice_id, organization_id,
          description, quantity, unit_price, amount,
          sort_order, is_taxable, tax_rate
        ) VALUES (
          v_invoice_id,
          v_org_id,
          COALESCE(v_sub.plan_name, 'Monthly Monitoring Service'),
          CASE WHEN v_is_annual THEN 12 ELSE 1 END,
          v_billing_amount,
          v_line_amount,
          v_line_sort,
          (COALESCE(v_is_tax_exempt, false) = false),
          v_tax_rate
        );

        v_line_sort := v_line_sort + 1;

        -- Advance this subscription's next_billing_date independently
        IF v_is_annual THEN
          v_next_date := calculate_next_billing_date(v_sub.next_billing_date, 'yearly', v_sub.billing_day);
        ELSE
          v_next_date := calculate_next_billing_date(v_sub.next_billing_date, 'monthly', v_sub.billing_day);
        END IF;

        UPDATE recurring_subscriptions
        SET next_billing_date = v_next_date,
            updated_at = now()
        WHERE id = v_sub.id;

        -- Create recurring_invoices tracking row
        INSERT INTO recurring_invoices (
          company_id, subscription_id, invoice_id,
          billing_period_start, billing_period_end,
          amount, status, scheduled_date, generated_at
        ) VALUES (
          v_org_id,
          v_sub.id,
          v_invoice_id,
          v_period_start,
          v_period_end,
          v_line_amount,
          'generated',
          v_period_start,
          now()
        ) RETURNING id INTO v_ri_id;
      END LOOP;

      -- Add discount line item if applicable
      IF v_discount > 0 THEN
        INSERT INTO invoice_line_items (
          invoice_id, organization_id,
          description, quantity, unit_price, amount,
          sort_order, is_taxable, tax_rate
        ) VALUES (
          v_invoice_id,
          v_org_id,
          'Annual Billing Discount',
          1,
          -v_discount,
          -v_discount,
          v_line_sort,
          false,
          0
        );
      END IF;

      v_generated := v_generated + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, 'Contact ' || v_contact.contact_id::text || ': ' || SQLERRM);
    END;
  END LOOP;

  -- Process orphan subscriptions (no contact_id) in legacy mode
  FOR v_sub IN
    SELECT rs.id, rs.custom_amount, rs.organization_id, rs.office_id,
           rs.next_billing_date, rs.billing_day,
           rp.id as plan_id, rp.plan_name, rp.billing_frequency,
           rp.amount as plan_amount, rp.tax_rate as plan_tax_rate
    FROM recurring_subscriptions rs
    LEFT JOIN recurring_plans rp ON rp.id = rs.plan_id
    WHERE rs.status = 'active'
      AND rs.auto_invoice = true
      AND rs.next_billing_date <= CURRENT_DATE
      AND rs.contact_id IS NULL
  LOOP
    BEGIN
      v_billing_amount := COALESCE(v_sub.custom_amount, v_sub.plan_amount, 0);
      IF v_billing_amount <= 0 THEN
        v_failed := v_failed + 1;
        v_errors := array_append(v_errors, 'Subscription ' || v_sub.id::text || ': zero billing amount');
        CONTINUE;
      END IF;

      v_org_id := COALESCE(v_sub.organization_id, public.get_user_org_id());
      v_tax_rate := COALESCE(v_sub.plan_tax_rate, 0);
      v_tax_amount := ROUND(v_billing_amount * v_tax_rate / 100, 2);
      v_total := v_billing_amount + v_tax_amount;
      v_period_start := v_sub.next_billing_date;
      v_period_end := (v_sub.next_billing_date + INTERVAL '1 month' - INTERVAL '1 day')::date;

      v_invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(
        (COALESCE(
          (SELECT MAX(CAST(SUBSTRING(invoice_number FROM 11) AS integer))
           FROM invoices
           WHERE invoice_number LIKE 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%')
        , 0) + 1)::text, 5, '0'
      );

      INSERT INTO invoices (
        organization_id, company_id, invoice_number, contact_id,
        invoice_date, due_date, subtotal, tax_amount, total,
        amount_paid, amount_due, status,
        tax_rate, tax_project_type, source_type, invoice_type, office_id,
        created_by, created_by_name
      ) VALUES (
        v_org_id, v_org_id, v_invoice_number, NULL,
        CURRENT_DATE, CURRENT_DATE + 10,
        v_billing_amount, v_tax_amount, v_total,
        0, v_total, 'sent',
        v_tax_rate, 'general_installation_repair', 'recurring', 'recurring',
        v_sub.office_id, v_org_id, 'Recurring Billing System'
      ) RETURNING id INTO v_invoice_id;

      INSERT INTO invoice_line_items (
        invoice_id, organization_id,
        description, quantity, unit_price, amount,
        sort_order, is_taxable, tax_rate
      ) VALUES (
        v_invoice_id, v_org_id,
        COALESCE(v_sub.plan_name, 'Monthly Monitoring Service'),
        1, v_billing_amount, v_billing_amount,
        1, true, v_tax_rate
      );

      v_next_date := calculate_next_billing_date(v_sub.next_billing_date, v_sub.billing_frequency, v_sub.billing_day);

      INSERT INTO recurring_invoices (
        company_id, subscription_id, invoice_id,
        billing_period_start, billing_period_end,
        amount, status, scheduled_date, generated_at
      ) VALUES (
        v_org_id, v_sub.id, v_invoice_id,
        v_period_start, v_period_end,
        v_billing_amount, 'generated', v_period_start, now()
      );

      UPDATE recurring_subscriptions
      SET next_billing_date = v_next_date, updated_at = now()
      WHERE id = v_sub.id;

      v_generated := v_generated + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, 'Subscription ' || v_sub.id::text || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'generated', v_generated,
    'failed', v_failed,
    'errors', to_jsonb(v_errors),
    'run_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION generate_recurring_invoices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_recurring_invoices() TO authenticated;
