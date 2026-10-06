ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS edit_unlocked_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS edit_unlocked_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS edit_unlock_reason text;
UPDATE public.invoices SET portal_visible=false WHERE status='draft';
ALTER TABLE public.invoices ADD CONSTRAINT invoice_draft_private CHECK(status<>'draft' OR NOT portal_visible);
CREATE OR REPLACE FUNCTION prevent_post_submit_field_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'draft' AND NEW.status='draft' THEN
    IF NOT public.can_view_all_org_invoices() OR OLD.organization_id IS DISTINCT FROM public.get_user_org_id()
       OR OLD.status NOT IN('submitted','overdue') OR coalesce(OLD.amount_paid,0)>0
       OR NEW.edit_unlocked_by IS DISTINCT FROM auth.uid() OR NEW.edit_unlocked_at IS NOT DISTINCT FROM OLD.edit_unlocked_at
       OR nullif(btrim(NEW.edit_unlock_reason),'') IS NULL OR NEW.portal_visible THEN
      RAISE EXCEPTION 'Use Unlock for Changes on an unpaid submitted invoice';
    END IF;
  END IF;
  IF NEW.status='draft' AND NEW.portal_visible THEN RAISE EXCEPTION 'Open drafts cannot appear on the customer portal'; END IF;
  IF COALESCE(OLD.status, 'draft') <> 'draft' THEN
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
       OR NEW.tax_snapshot_id IS DISTINCT FROM OLD.tax_snapshot_id
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
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.payment_terms IS DISTINCT FROM OLD.payment_terms
       OR NEW.jobsite_zip IS DISTINCT FROM OLD.jobsite_zip
    THEN
      RAISE EXCEPTION 'Cannot modify accounting fields on a submitted invoice. Fields are locked after submission.'
      USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


CREATE FUNCTION public.unlock_invoice_for_changes(p_invoice_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inv public.invoices;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_view_all_org_invoices() THEN RAISE EXCEPTION 'Billing permission required'; END IF;
 IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Enter the reason for unlocking'; END IF;
 SELECT * INTO inv FROM public.invoices WHERE id=p_invoice_id AND organization_id=public.get_user_org_id() FOR UPDATE;
 IF NOT FOUND OR inv.status NOT IN('submitted','overdue') OR coalesce(inv.amount_paid,0)>0 OR inv.security_billing_cycle_id IS NOT NULL THEN RAISE EXCEPTION 'Only unpaid submitted service/project invoices can be unlocked'; END IF;
 IF EXISTS(SELECT 1 FROM public.invoice_portal_deliveries WHERE invoice_id=inv.id AND status='processing' AND lease_until>now()) THEN RAISE EXCEPTION 'Invoice delivery is in progress; retry unlocking after it finishes'; END IF;
 UPDATE public.invoices SET status='draft',portal_visible=false,qbo_payment_url=null,edit_unlocked_by=auth.uid(),edit_unlocked_at=clock_timestamp(),edit_unlock_reason=btrim(p_reason) WHERE id=inv.id;
 UPDATE public.service_billing_queue SET status='invoice_created' WHERE invoice_id=inv.id;
END $$;
REVOKE ALL ON FUNCTION public.unlock_invoice_for_changes(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.unlock_invoice_for_changes(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION prevent_line_item_changes_on_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_status text;
  v_inv_id uuid;
BEGIN
  v_inv_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;

  IF TG_OP='UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id AND EXISTS(SELECT 1 FROM invoices WHERE id=OLD.invoice_id AND status<>'draft') THEN RAISE EXCEPTION 'Cannot move a submitted invoice line'; END IF;

  SELECT status INTO v_invoice_status
  FROM invoices WHERE id = v_inv_id;

  IF v_invoice_status IS NOT NULL AND v_invoice_status <> 'draft' THEN
    RAISE EXCEPTION 'Cannot % line items on a submitted invoice. Line items are locked after submission.',
      TG_OP
    USING ERRCODE = 'check_violation';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_line_items_insert ON invoice_line_items;
CREATE TRIGGER trg_lock_line_items_insert
  BEFORE INSERT ON invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_line_item_changes_on_submitted();

DROP TRIGGER IF EXISTS trg_lock_line_items_update ON invoice_line_items;
CREATE TRIGGER trg_lock_line_items_update
  BEFORE UPDATE ON invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_line_item_changes_on_submitted();

DROP TRIGGER IF EXISTS trg_lock_line_items_delete ON invoice_line_items;
CREATE TRIGGER trg_lock_line_items_delete
  BEFORE DELETE ON invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_line_item_changes_on_submitted();


REVOKE ALL ON FUNCTION public.prevent_post_submit_field_changes() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.prevent_line_item_changes_on_submitted() FROM PUBLIC,anon,authenticated;
-- Discarding an unsubmitted draft releases its visit; previously issued invoices retain their history.
CREATE FUNCTION private.release_work_order_invoice_draft() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.edit_unlocked_at IS NOT NULL THEN RAISE EXCEPTION 'A previously submitted invoice must be voided, not deleted'; END IF;
 IF OLD.status='draft' THEN UPDATE public.service_billing_queue SET invoice_id=null,invoiced_at=null,status='ready_for_billing' WHERE invoice_id=OLD.id; END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION private.release_work_order_invoice_draft() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER release_work_order_invoice_draft BEFORE DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.release_work_order_invoice_draft();
-- Keep the tax/numbering engine intact, behind a tenant-scoped submission boundary.
ALTER FUNCTION public.submit_invoice(uuid) SET SCHEMA private;
ALTER FUNCTION private.submit_invoice(uuid) RENAME TO submit_invoice_engine;
REVOKE ALL ON FUNCTION private.submit_invoice_engine(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.submit_invoice_authorized(p_invoice_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (
 auth.uid() IS NULL OR NOT public.can_view_all_org_invoices() OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=p_invoice_id AND organization_id=public.get_user_org_id())) THEN RAISE EXCEPTION 'Billing permission required for this organization'; END IF;
 RETURN private.submit_invoice_engine(p_invoice_id);
END $$;
REVOKE ALL ON FUNCTION private.submit_invoice_authorized(uuid) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.submit_invoice_authorized(uuid) TO authenticated,service_role;
CREATE FUNCTION public.submit_invoice(p_invoice_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.submit_invoice_authorized(p_invoice_id); $$;
REVOKE ALL ON FUNCTION public.submit_invoice(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_invoice(uuid) TO authenticated,service_role;
