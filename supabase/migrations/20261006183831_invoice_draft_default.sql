-- Every creation path starts private. Submission is a separate operation,
-- even when creation and explicit submission happen in one transaction.
ALTER TABLE public.invoices ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE public.invoices ALTER COLUMN portal_visible SET DEFAULT false;

CREATE FUNCTION private.initialize_invoice_draft() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.status := 'draft';
  NEW.portal_visible := false;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.initialize_invoice_draft() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER a_initialize_invoice_draft
BEFORE INSERT ON public.invoices FOR EACH ROW
EXECUTE FUNCTION private.initialize_invoice_draft();

-- Direct client updates must not bypass the submission engine's validation.
CREATE FUNCTION private.require_invoice_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF OLD.status='draft' AND NEW.status IN ('submitted','partial','paid','overdue')
     AND current_user <> pg_catalog.pg_get_userbyid((SELECT proowner FROM pg_catalog.pg_proc WHERE oid='private.submit_invoice_engine(uuid)'::regprocedure)) THEN
    RAISE EXCEPTION 'Use Submit Invoice before billing or recording payment';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.require_invoice_submission() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER a_require_invoice_submission BEFORE UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION private.require_invoice_submission();

-- A payment must not cause the payment-status trigger to publish a draft.
CREATE FUNCTION private.require_submitted_invoice_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invoice_status text;
BEGIN
  SELECT status INTO invoice_status FROM public.invoices WHERE id=NEW.invoice_id FOR UPDATE;
  IF invoice_status IS NULL OR invoice_status NOT IN ('submitted','partial','overdue','paid') THEN
    RAISE EXCEPTION 'Submit the invoice before recording payment';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.require_submitted_invoice_payment() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER a_require_submitted_invoice_payment BEFORE INSERT OR UPDATE OF invoice_id ON public.payments
FOR EACH ROW EXECUTE FUNCTION private.require_submitted_invoice_payment();
