-- Exempt tax_snapshot_id from the post-submit locking trigger
-- The tax_snapshot_id is set by write_tax_snapshot() during finalization,
-- not by user edits. It must be allowed to be set once on a submitted invoice.
-- The idempotency guard in write_tax_snapshot_on_invoice_finalized ensures
-- it is only set once (skips if already non-null).

CREATE OR REPLACE FUNCTION prevent_post_submit_field_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.status, 'draft') <> 'draft' AND NEW.status = OLD.status THEN
    IF NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN
      RAISE EXCEPTION 'Cannot modify customer on a submitted invoice. Void and recreate if needed.'
      USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.tax_environment IS DISTINCT FROM OLD.tax_environment
       OR NEW.tax_project_type IS DISTINCT FROM OLD.tax_project_type
       OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
       OR NEW.tax_jurisdiction_id IS DISTINCT FROM OLD.tax_jurisdiction_id
       OR NEW.billing_name IS DISTINCT FROM OLD.billing_name
       OR NEW.billing_address_line1 IS DISTINCT FROM OLD.billing_address_line1
       OR NEW.billing_address_line2 IS DISTINCT FROM OLD.billing_address_line2
       OR NEW.billing_city IS DISTINCT FROM OLD.billing_city
       OR NEW.billing_state IS DISTINCT FROM OLD.billing_state
       OR NEW.billing_zip IS DISTINCT FROM OLD.billing_zip
       OR NEW.jobsite_address IS DISTINCT FROM OLD.jobsite_address
       OR NEW.jobsite_city IS DISTINCT FROM OLD.jobsite_city
       OR NEW.jobsite_state IS DISTINCT FROM OLD.jobsite_state
       OR NEW.jobsite_zip IS DISTINCT FROM OLD.jobsite_zip
    THEN
      RAISE EXCEPTION 'Cannot modify accounting fields on a submitted invoice. Fields are locked after submission.'
      USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
