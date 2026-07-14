/*
# Create Recurring Billing Generation Function

## Purpose
Creates a PostgreSQL function `generate_recurring_invoices()` that finds all
active recurring subscriptions with `next_billing_date <= CURRENT_DATE` and
`auto_invoice = true`, generates invoices for them, creates `recurring_invoices`
tracking rows, and advances the subscription's `next_billing_date`.

## How It Works
1. Iterates over due subscriptions joined with their plans and contacts
2. For each due subscription:
   a. Creates an `invoices` record with the billing amount, contact, and tax info
   b. Creates an `invoice_line_items` row for the monitoring service
   c. Creates a `recurring_invoices` row linking subscription → invoice
   d. Advances `next_billing_date` using `calculate_next_billing_date()`
3. Returns a summary of generated invoices

## Security
- Function is SECURITY DEFINER so it can run from the edge function with service role
- Uses `search_path = ''` for security
*/

CREATE OR REPLACE FUNCTION generate_recurring_invoices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_generated integer := 0;
  v_failed integer := 0;
  v_errors text[] := ARRAY[]::text[];
  v_sub RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_billing_amount numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_total numeric;
  v_period_start date;
  v_period_end date;
  v_ri_id uuid;
  v_next_date date;
BEGIN
  -- Find all due subscriptions
  FOR v_sub IN
    SELECT rs.id, rs.contact_id, rs.custom_amount, rs.organization_id,
           rs.office_id, rs.next_billing_date, rs.billing_day,
           rp.id as plan_id, rp.plan_name, rp.billing_frequency,
           rp.amount as plan_amount, rp.tax_rate as plan_tax_rate,
           c.full_name as contact_name, c.email as contact_email,
           c.tax_rate as contact_tax_rate, c.is_tax_exempt,
           c.tax_environment, c.tax_jurisdiction_id
    FROM recurring_subscriptions rs
    LEFT JOIN recurring_plans rp ON rp.id = rs.plan_id
    LEFT JOIN contacts c ON c.id = rs.contact_id
    WHERE rs.status = 'active'
      AND rs.auto_invoice = true
      AND rs.next_billing_date <= CURRENT_DATE
  LOOP
    BEGIN
      -- Determine billing amount (custom_amount overrides plan amount)
      v_billing_amount := COALESCE(v_sub.custom_amount, v_sub.plan_amount, 0);
      IF v_billing_amount <= 0 THEN
        v_failed := v_failed + 1;
        v_errors := array_append(v_errors, 'Subscription ' || v_sub.id::text || ': zero billing amount');
        CONTINUE;
      END IF;

      -- Determine tax rate
      v_tax_rate := COALESCE(v_sub.contact_tax_rate, v_sub.plan_tax_rate, 0);
      IF COALESCE(v_sub.is_tax_exempt, false) = true THEN
        v_tax_rate := 0;
      END IF;
      v_tax_amount := ROUND(v_billing_amount * v_tax_rate / 100, 2);
      v_total := v_billing_amount + v_tax_amount;

      -- Billing period
      v_period_start := v_sub.next_billing_date;
      v_period_end := (v_sub.next_billing_date + INTERVAL '1 month' - INTERVAL '1 day')::date;

      -- Generate invoice number
      v_invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(
        (COALESCE(
          (SELECT MAX(CAST(SUBSTRING(invoice_number FROM 11) AS integer))
           FROM invoices
           WHERE invoice_number LIKE 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%')
        , 0) + 1)::text, 5, '0'
      );

      -- Create the invoice
      INSERT INTO invoices (
        organization_id, company_id, invoice_number, contact_id,
        invoice_date, due_date, subtotal, tax_amount, total,
        amount_paid, amount_due, status,
        tax_rate, tax_environment, tax_jurisdiction_id,
        tax_project_type, source_type, invoice_type, office_id,
        created_by, created_by_name
      ) VALUES (
        v_sub.organization_id,
        v_sub.organization_id,
        v_invoice_number,
        v_sub.contact_id,
        CURRENT_DATE,
        CURRENT_DATE + 10,
        v_billing_amount,
        v_tax_amount,
        v_total,
        0,
        v_total,
        'sent',
        v_tax_rate,
        COALESCE(v_sub.tax_environment, 'residential'),
        v_sub.tax_jurisdiction_id,
        'general_installation_repair',
        'recurring',
        'recurring',
        v_sub.office_id,
        v_sub.organization_id,
        'Recurring Billing System'
      ) RETURNING id INTO v_invoice_id;

      -- Create invoice line item
      INSERT INTO invoice_line_items (
        invoice_id, organization_id,
        description, quantity, unit_price, line_total,
        taxable, tax_rate
      ) VALUES (
        v_invoice_id,
        v_sub.organization_id,
        COALESCE(v_sub.plan_name, 'Monthly Monitoring Service'),
        1,
        v_billing_amount,
        v_billing_amount,
        (COALESCE(v_sub.is_tax_exempt, false) = false),
        v_tax_rate
      );

      -- Calculate next billing date
      v_next_date := calculate_next_billing_date(
        v_sub.next_billing_date,
        v_sub.billing_frequency,
        v_sub.billing_day
      );

      -- Create recurring_invoices tracking row
      INSERT INTO recurring_invoices (
        company_id, subscription_id, invoice_id,
        billing_period_start, billing_period_end,
        amount, status, scheduled_date, generated_at
      ) VALUES (
        v_sub.organization_id,
        v_sub.id,
        v_invoice_id,
        v_period_start,
        v_period_end,
        v_billing_amount,
        'generated',
        v_period_start,
        now()
      ) RETURNING id INTO v_ri_id;

      -- Advance the subscription's next billing date
      UPDATE recurring_subscriptions
      SET next_billing_date = v_next_date,
          updated_at = now()
      WHERE id = v_sub.id;

      v_generated := v_generated + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, 'Subscription ' || v_sub.id::text || ': ' || SQLERRM);
    END;
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'generated', v_generated,
    'failed', v_failed,
    'errors', to_jsonb(v_errors),
    'run_at', now()
  );

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated and anon (edge function uses service role)
GRANT EXECUTE ON FUNCTION generate_recurring_invoices() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_recurring_invoices() TO anon;
