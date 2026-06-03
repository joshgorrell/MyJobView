/*
  # Auto-generate invoice_number on INSERT

  ## Problem
  Multiple invoice creation paths (CreateSOInvoiceModal, CreateProgressInvoiceModal,
  CreateInvoiceFromCOModal, CreateInvoiceModal) were all failing with a NOT NULL
  constraint violation on invoice_number because none of them were generating or
  passing invoice_number in the INSERT payload.

  ## Solution
  Add a BEFORE INSERT trigger that calls the existing generate_invoice_number()
  function whenever invoice_number is NULL or empty. This fixes all current and
  future invoice creation paths at the DB level.

  ## Changes
  - New trigger function: auto_set_invoice_number()
  - New trigger: trg_auto_set_invoice_number on invoices BEFORE INSERT
*/

CREATE OR REPLACE FUNCTION auto_set_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_set_invoice_number ON invoices;

CREATE TRIGGER trg_auto_set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_invoice_number();
