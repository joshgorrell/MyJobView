-- First repair phase. Existing commission records are retained as revision 1;
-- historical attribution/rate/basis correction requires a reviewed reconciliation.
-- New invoices use revision 2. No company/employee rates are changed here.
CREATE SCHEMA IF NOT EXISTS commission_private;
REVOKE ALL ON SCHEMA commission_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA commission_private TO authenticated;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS commission_work_order_id uuid REFERENCES work_orders(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS convenience_fee_amount numeric(12,2) NOT NULL DEFAULT 0
  CHECK (abs(convenience_fee_amount) <= abs(amount)
    AND (convenience_fee_amount=0 OR sign(convenience_fee_amount)=sign(amount)));
ALTER TABLE commission_records ADD COLUMN IF NOT EXISTS calculation_revision integer NOT NULL DEFAULT 1;
ALTER TABLE commission_records ADD COLUMN IF NOT EXISTS recipient_type text NOT NULL DEFAULT 'employee'
  CHECK (recipient_type IN ('employee','service_department'));
ALTER TABLE commission_records ADD COLUMN IF NOT EXISTS source_sales_order_id uuid REFERENCES sales_orders(id);
ALTER TABLE commission_records ADD COLUMN IF NOT EXISTS source_work_order_id uuid REFERENCES work_orders(id);
ALTER TABLE commission_records ADD COLUMN IF NOT EXISTS attribution_locked boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS commission_records_v2_recipient
  ON commission_records(invoice_id,role_type,COALESCE(employee_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE calculation_revision=2;
CREATE INDEX IF NOT EXISTS commission_records_source_order ON commission_records(source_sales_order_id) WHERE source_sales_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_commission_work_order ON invoices(commission_work_order_id) WHERE commission_work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_commission_period ON payments(organization_id,payment_date,invoice_id);

CREATE OR REPLACE FUNCTION commission_private.validate_invoice_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND organization_id=NEW.organization_id) THEN
  RAISE EXCEPTION 'Invoice project belongs to a different organization' USING ERRCODE='42501'; END IF;
 IF NEW.sales_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales_orders WHERE id=NEW.sales_order_id AND organization_id=NEW.organization_id) THEN
  RAISE EXCEPTION 'Invoice sales order belongs to a different organization' USING ERRCODE='42501'; END IF;
 IF NEW.proposal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM proposals WHERE id=NEW.proposal_id AND organization_id=NEW.organization_id) THEN
  RAISE EXCEPTION 'Invoice proposal belongs to a different organization' USING ERRCODE='42501'; END IF;
 IF NEW.commission_work_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_orders WHERE id=NEW.commission_work_order_id
  AND organization_id=NEW.organization_id AND contact_id=NEW.contact_id) THEN
  RAISE EXCEPTION 'Invoice work order does not match the organization/customer' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id
  AND (EXISTS(SELECT 1 FROM commission_records WHERE invoice_id=OLD.id) OR EXISTS(SELECT 1 FROM payments WHERE invoice_id=OLD.id)) THEN
  RAISE EXCEPTION 'Cannot change organization after financial activity' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commission_validate_invoice_source BEFORE INSERT OR UPDATE ON invoices
 FOR EACH ROW EXECUTE FUNCTION commission_private.validate_invoice_source();

CREATE OR REPLACE FUNCTION commission_private.validate_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ids uuid[]; target uuid; org uuid; BEGIN
 IF TG_OP='INSERT' THEN ids:=ARRAY[NEW.invoice_id];
 ELSIF TG_OP='DELETE' THEN ids:=ARRAY[OLD.invoice_id]; ELSE ids:=ARRAY[OLD.invoice_id,NEW.invoice_id]; END IF;
 -- Serialize collections before reading any aggregates and acquire both rows
 -- in a stable order for corrections moved between invoices.
 FOR target IN SELECT DISTINCT v FROM unnest(ids) v WHERE v IS NOT NULL ORDER BY v LOOP
  SELECT organization_id INTO org FROM invoices WHERE id=target FOR UPDATE;
  IF FOUND AND TG_OP<>'DELETE' AND target=NEW.invoice_id AND org IS DISTINCT FROM NEW.organization_id THEN
   RAISE EXCEPTION 'Payment and invoice must belong to the same organization' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER commission_validate_payment BEFORE INSERT OR UPDATE OR DELETE ON payments
 FOR EACH ROW EXECUTE FUNCTION commission_private.validate_payment();

CREATE OR REPLACE FUNCTION commission_private.can_manage(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM profiles p WHERE p.id=auth.uid() AND p.organization_id=p_org
  AND p.is_active IS TRUE AND p.role IN ('admin','finance','manager','sales_manager'));
$$;
CREATE OR REPLACE FUNCTION commission_private.is_member(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM profiles p WHERE p.id=auth.uid() AND p.organization_id=p_org AND p.is_active IS TRUE);
$$;
REVOKE ALL ON FUNCTION commission_private.can_manage(uuid),commission_private.is_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION commission_private.can_manage(uuid),commission_private.is_member(uuid) TO authenticated;

-- Remove all earlier permissive policies; adding restrictive-looking policies
-- alongside legacy policies would still leave their OR-based access in place.
DO $$ DECLARE p record; t text; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('commission_records','commission_payments','commission_adjustments',
 'company_commission_settings','employee_commission_config','project_commission_overrides',
 'commission_report_rate_overrides','commission_report_deductions','commission_statements','commission_payment_batches')
 LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
 FOR t IN SELECT unnest(ARRAY['commission_records','commission_payments','commission_adjustments',
 'company_commission_settings','employee_commission_config','project_commission_overrides',
 'commission_report_rate_overrides','commission_report_deductions','commission_statements','commission_payment_batches'])
 LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t); END LOOP;
END $$;

-- Financial records are client read-only; future approval/payout mutations must
-- be authorized atomic server operations, not direct browser updates.
GRANT SELECT ON commission_records,commission_payments,commission_adjustments,commission_statements,commission_payment_batches TO authenticated;
CREATE POLICY commission_records_read ON commission_records FOR SELECT TO authenticated
 USING(commission_private.is_member(organization_id) AND (employee_id=auth.uid() OR commission_private.can_manage(organization_id)));
CREATE POLICY commission_payments_read ON commission_payments FOR SELECT TO authenticated
 USING(commission_private.is_member(organization_id) AND (employee_id=auth.uid() OR commission_private.can_manage(organization_id)));
CREATE POLICY commission_adjustments_read ON commission_adjustments FOR SELECT TO authenticated
 USING(commission_private.can_manage(organization_id));

-- Older batch/statement tables lack organization_id. Derive it from their
-- authoritative employee/processor, rather than exposing every tenant's rows.
CREATE POLICY commission_statements_read ON commission_statements FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM profiles p WHERE p.id=employee_id AND commission_private.is_member(p.organization_id)
 AND (employee_id=auth.uid() OR commission_private.can_manage(p.organization_id))));
CREATE POLICY commission_batches_read ON commission_payment_batches FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM profiles p WHERE p.id=processed_by AND commission_private.can_manage(p.organization_id)));

GRANT SELECT,INSERT,UPDATE,DELETE ON company_commission_settings,employee_commission_config,
 project_commission_overrides,commission_report_rate_overrides,commission_report_deductions TO authenticated;
CREATE POLICY commission_settings_read ON company_commission_settings FOR SELECT TO authenticated
 USING(commission_private.is_member(organization_id));
CREATE POLICY commission_settings_manage ON company_commission_settings FOR ALL TO authenticated
 USING(commission_private.can_manage(organization_id)) WITH CHECK(commission_private.can_manage(organization_id));
CREATE POLICY employee_commission_read ON employee_commission_config FOR SELECT TO authenticated
 USING(commission_private.is_member(organization_id) AND (employee_id=auth.uid() OR commission_private.can_manage(organization_id)));
CREATE POLICY employee_commission_manage ON employee_commission_config FOR ALL TO authenticated
 USING(commission_private.can_manage(organization_id)) WITH CHECK(commission_private.can_manage(organization_id)
 AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=employee_id AND p.organization_id=employee_commission_config.organization_id));
CREATE POLICY project_commission_read ON project_commission_overrides FOR SELECT TO authenticated
 USING(commission_private.can_manage(organization_id));
CREATE POLICY project_commission_manage ON project_commission_overrides FOR ALL TO authenticated
 USING(commission_private.can_manage(organization_id)) WITH CHECK(commission_private.can_manage(organization_id)
 AND EXISTS(SELECT 1 FROM projects p WHERE p.id=project_id AND p.organization_id=project_commission_overrides.organization_id));
CREATE POLICY report_rate_read ON commission_report_rate_overrides FOR SELECT TO authenticated
 USING(commission_private.is_member(organization_id) AND (employee_id=auth.uid() OR commission_private.can_manage(organization_id)));
CREATE POLICY report_rate_manage ON commission_report_rate_overrides FOR ALL TO authenticated
 USING(commission_private.can_manage(organization_id)) WITH CHECK(commission_private.can_manage(organization_id)
 AND EXISTS(SELECT 1 FROM invoices i WHERE i.id=invoice_id AND i.organization_id=commission_report_rate_overrides.organization_id)
 AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=employee_id AND p.organization_id=commission_report_rate_overrides.organization_id));
CREATE POLICY report_deduction_read ON commission_report_deductions FOR SELECT TO authenticated
 USING(commission_private.is_member(organization_id) AND (employee_id=auth.uid() OR commission_private.can_manage(organization_id)));
CREATE POLICY report_deduction_manage ON commission_report_deductions FOR ALL TO authenticated
 USING(commission_private.can_manage(organization_id)) WITH CHECK(commission_private.can_manage(organization_id)
 AND (employee_id IS NULL OR EXISTS(SELECT 1 FROM profiles p WHERE p.id=employee_id AND p.organization_id=commission_report_deductions.organization_id)));

CREATE OR REPLACE FUNCTION commission_private.effective_rate(p_org uuid,p_employee uuid,p_role text)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c employee_commission_config%ROWTYPE; s company_commission_settings%ROWTYPE; result numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_employee AND organization_id=p_org AND is_active IS TRUE) THEN RETURN NULL; END IF;
 SELECT * INTO c FROM employee_commission_config WHERE employee_id=p_employee AND organization_id=p_org;
 IF NOT FOUND OR c.eligible_for_commissions IS NOT TRUE OR
 (c.effective_from IS NOT NULL AND c.effective_from>CURRENT_DATE) OR
 (c.effective_to IS NOT NULL AND c.effective_to<CURRENT_DATE) THEN RETURN NULL; END IF;
 SELECT * INTO s FROM company_commission_settings WHERE organization_id=p_org ORDER BY created_at,id LIMIT 1;
 result := CASE p_role
 WHEN 'sales_projects' THEN COALESCE(c.custom_sales_projects_rate,s.default_sales_projects_rate)
 WHEN 'design' THEN COALESCE(c.custom_design_rate,s.default_design_rate)
 WHEN 'pm' THEN COALESCE(c.custom_pm_rate,s.default_pm_rate)
 WHEN 'service_sales' THEN COALESCE(c.custom_service_sales_rate,s.default_service_sales_rate)
 WHEN 'service_pm' THEN COALESCE(c.custom_service_pm_rate,s.default_service_pm_rate) END;
 IF result<0 OR result>100 THEN RETURN NULL; END IF;
 RETURN result;
END $$;

-- Preserve the public API, but never return a different tenant's rate.
CREATE OR REPLACE FUNCTION public.get_effective_commission_rate(p_employee_id uuid,p_role_type text)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid; BEGIN
 SELECT organization_id INTO org FROM profiles WHERE id=p_employee_id;
 IF NOT commission_private.is_member(org) OR (p_employee_id<>auth.uid() AND NOT commission_private.can_manage(org)) THEN
 RAISE EXCEPTION 'Not authorized to view commission rate' USING ERRCODE='42501'; END IF;
 RETURN commission_private.effective_rate(org,p_employee_id,p_role_type);
END $$;
REVOKE ALL ON FUNCTION public.get_effective_commission_rate(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_effective_commission_rate(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION commission_private.sync_invoice(p_invoice uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i invoices%ROWTYPE; s company_commission_settings%ROWTYPE; pr projects%ROWTYPE;
 so sales_orders%ROWTYPE; wo work_orders%ROWTYPE; rep uuid; pm uuid; designer uuid;
 source_so uuid; source_wo uuid; is_service boolean:=false; r record; rate numeric;
 basis numeric; fees numeric; collected numeric; locked boolean;
BEGIN
 SELECT * INTO i FROM invoices WHERE id=p_invoice FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 -- Leave historical attribution and all paid history untouched until reviewed.
 IF EXISTS(SELECT 1 FROM commission_records WHERE invoice_id=i.id AND calculation_revision=1) THEN
  -- Retain the historical basis/rate/recipient, but keep future collections
  -- working without the old trigger's row-reference error.
  UPDATE commission_records SET amount_collected=i.amount_paid,
   amount_earned=CASE WHEN i.total<=0 THEN 0 ELSE round(total_potential_commission*GREATEST(0,LEAST(i.amount_paid/i.total,1)),2) END,
   status=CASE WHEN amount_paid>0 AND amount_paid>=CASE WHEN i.total<=0 THEN 0 ELSE round(total_potential_commission*GREATEST(0,LEAST(i.amount_paid/i.total,1)),2) END THEN 'paid'
    WHEN i.amount_paid>0 THEN 'ready_to_pay' ELSE 'pending' END,updated_at=now()
   WHERE invoice_id=i.id AND calculation_revision=1;
  RETURN;
 END IF;
 SELECT * INTO s FROM company_commission_settings WHERE organization_id=i.organization_id ORDER BY created_at,id LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT COALESCE(sum(amount-convenience_fee_amount),0) INTO collected FROM payments WHERE invoice_id=i.id;
 SELECT EXISTS(SELECT 1 FROM commission_records WHERE invoice_id=i.id AND (attribution_locked OR amount_paid>0)) INTO locked;
 IF NOT locked THEN
  IF i.commission_work_order_id IS NOT NULL THEN
   SELECT * INTO wo FROM work_orders WHERE id=i.commission_work_order_id AND organization_id=i.organization_id;
   IF NOT FOUND OR wo.contact_id IS DISTINCT FROM i.contact_id THEN RAISE EXCEPTION 'Invalid commission work order'; END IF;
   source_wo:=wo.id; is_service:=wo.type='service';
  ELSE
   SELECT w.* INTO wo FROM service_billing_queue q JOIN work_orders w ON w.id=q.work_order_id
    WHERE q.invoice_id=i.id AND q.organization_id=i.organization_id AND w.organization_id=i.organization_id ORDER BY q.id LIMIT 1;
   IF FOUND THEN source_wo:=wo.id; is_service:=wo.type='service'; END IF;
  END IF;
  IF is_service THEN rep:=wo.customer_sales_rep_id;
  ELSE
   SELECT * INTO pr FROM projects WHERE id=i.project_id AND organization_id=i.organization_id;
   source_so:=COALESCE(i.sales_order_id,pr.sales_order_id,
    (SELECT id FROM sales_orders WHERE proposal_id=i.proposal_id AND organization_id=i.organization_id ORDER BY id LIMIT 1));
   SELECT * INTO so FROM sales_orders WHERE id=source_so AND organization_id=i.organization_id;
   source_so:=so.id;
   rep:=COALESCE(so.sales_rep_id,pr.salesperson_id);
   pm:=pr.assigned_pm; designer:=pr.designer_id;
   -- Proposal deposits can arrive before the project exists.
   IF rep IS NULL AND i.proposal_id IS NOT NULL THEN
    -- Proposal created_by stores the explicitly selected sales rep in the builder.
    SELECT created_by INTO rep FROM proposals WHERE id=i.proposal_id AND organization_id=i.organization_id;
   END IF;
  END IF;
  -- Only uncollected revision-2 draft attribution is replaceable.
  DELETE FROM commission_records WHERE invoice_id=i.id AND calculation_revision=2 AND NOT attribution_locked
   AND (CASE role_type WHEN 'sales_projects' THEN is_service OR employee_id IS DISTINCT FROM rep
    WHEN 'service_sales' THEN NOT is_service OR employee_id IS DISTINCT FROM rep
    WHEN 'pm' THEN is_service OR employee_id IS DISTINCT FROM pm
    WHEN 'design' THEN is_service OR employee_id IS DISTINCT FROM designer
    WHEN 'service_pm' THEN NOT is_service END);
  FOR r IN SELECT * FROM (VALUES
   (rep,CASE WHEN is_service THEN 'service_sales' ELSE 'sales_projects' END,'employee'),
   (pm,'pm','employee'),(designer,'design','employee'),
   (NULL::uuid,'service_pm',CASE WHEN is_service THEN 'service_department' ELSE 'skip' END)
  ) recipients(employee_id,role_type,recipient_type) LOOP
   IF r.recipient_type='skip' OR (r.recipient_type='employee' AND r.employee_id IS NULL) THEN CONTINUE; END IF;
   -- Keep the rate/basis snapshot for an existing recipient; changing company
   -- defaults must not retroactively reprice their already-created invoice.
   IF EXISTS(SELECT 1 FROM commission_records WHERE invoice_id=i.id AND calculation_revision=2
    AND role_type=r.role_type AND employee_id IS NOT DISTINCT FROM r.employee_id) THEN CONTINUE; END IF;
   IF r.role_type='design' AND NOT EXISTS(SELECT 1 FROM employee_commission_config WHERE employee_id=r.employee_id
    AND organization_id=i.organization_id AND design_credit_mode='auto') THEN CONTINUE; END IF;
   rate:=CASE WHEN r.recipient_type='service_department' THEN s.default_service_pm_rate
    ELSE commission_private.effective_rate(i.organization_id,r.employee_id,r.role_type) END;
   IF rate IS NULL OR rate<=0 OR rate>100 THEN CONTINUE; END IF;
   INSERT INTO commission_records(employee_id,project_id,invoice_id,organization_id,role_type,basis_type,commission_rate,
    calculation_revision,recipient_type,source_sales_order_id,source_work_order_id,attribution_locked)
   VALUES(r.employee_id,i.project_id,i.id,i.organization_id,r.role_type,s.commission_basis,rate,
    2,r.recipient_type,source_so,source_wo,collected>0);
  END LOOP;
 END IF;
 -- Exclude actual billed CC fee lines. Payment convenience fees are excluded
 -- from collections separately; do not guess fees from the current company %.
 SELECT COALESCE(sum(l.amount),0) INTO fees FROM invoice_line_items l JOIN tax_classifications t ON t.id=l.tax_classification_id
  WHERE l.invoice_id=i.id AND t.code='credit_card_fee';
 basis:=GREATEST(0,i.subtotal-fees);
 IF i.status IN ('void','voided','cancelled') THEN basis:=0; END IF;
 IF i.status IN ('void','voided','cancelled','draft') THEN collected:=0; END IF;
 FOR r IN SELECT * FROM commission_records WHERE invoice_id=i.id AND calculation_revision=2 LOOP
  UPDATE commission_records SET
   project_id=COALESCE(r.project_id,i.project_id),
   source_sales_order_id=COALESCE(r.source_sales_order_id,i.sales_order_id,
    (SELECT sales_order_id FROM projects WHERE id=i.project_id AND organization_id=i.organization_id)),
   basis_amount=CASE WHEN r.basis_type='profit' THEN 0 ELSE basis END,
   total_potential_commission=CASE WHEN r.basis_type='profit' THEN 0 ELSE round(basis*r.commission_rate/100,2) END,
   amount_collected=GREATEST(0,LEAST(collected,i.total)),
   amount_earned=CASE WHEN i.total<=0 OR r.basis_type='profit' THEN 0 ELSE
    round(basis*r.commission_rate/100*GREATEST(0,LEAST(collected/i.total,1)),2) END,
   attribution_locked=r.attribution_locked OR collected>0,
   approval_status=CASE WHEN r.basis_type='profit' THEN 'on_hold' ELSE r.approval_status END,
   hold_reason=CASE WHEN r.basis_type='profit' THEN 'Profit commission requires verified costs; no estimated profit payout.' ELSE r.hold_reason END,
   status=CASE WHEN r.amount_paid>0 AND r.amount_paid>=CASE WHEN i.total<=0 OR r.basis_type='profit' THEN 0 ELSE
    round(basis*r.commission_rate/100*GREATEST(0,LEAST(collected/i.total,1)),2) END THEN 'paid'
    WHEN collected>0 AND i.total>0 THEN 'ready_to_pay' ELSE 'pending' END,updated_at=now()
  WHERE id=r.id;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_commission_records_for_invoice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM commission_private.sync_invoice(NEW.id); RETURN NEW;
END $$;

-- Use table-specific row identifiers. Reading NEW.invoice_id on invoices was
-- the previous payment-blocking runtime error. Both handlers derive cash from
-- payments, so alphabetical AFTER-trigger order cannot leave stale earnings.
CREATE OR REPLACE FUNCTION public.update_commission_on_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE invoice_id_to_sync uuid; old_invoice uuid; BEGIN
 IF TG_TABLE_NAME='invoices' THEN invoice_id_to_sync:=NEW.id;
 ELSE
  IF TG_OP<>'INSERT' THEN old_invoice:=OLD.invoice_id; END IF;
  IF TG_OP<>'DELETE' THEN invoice_id_to_sync:=NEW.invoice_id; END IF;
 END IF;
 IF old_invoice IS NOT NULL THEN PERFORM commission_private.sync_invoice(old_invoice); END IF;
 IF invoice_id_to_sync IS NOT NULL AND invoice_id_to_sync IS DISTINCT FROM old_invoice THEN
  PERFORM commission_private.sync_invoice(invoice_id_to_sync); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER IF EXISTS trigger_update_commission_on_invoice_update ON invoices;
CREATE TRIGGER trigger_update_commission_on_invoice_update AFTER UPDATE ON invoices FOR EACH ROW
 WHEN(OLD.amount_paid IS DISTINCT FROM NEW.amount_paid OR OLD.total IS DISTINCT FROM NEW.total
 OR OLD.subtotal IS DISTINCT FROM NEW.subtotal OR OLD.status IS DISTINCT FROM NEW.status
 OR OLD.project_id IS DISTINCT FROM NEW.project_id OR OLD.sales_order_id IS DISTINCT FROM NEW.sales_order_id
 OR OLD.commission_work_order_id IS DISTINCT FROM NEW.commission_work_order_id)
 EXECUTE FUNCTION update_commission_on_payment();

CREATE OR REPLACE FUNCTION commission_private.sync_related_invoice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF TG_OP<>'INSERT' THEN PERFORM commission_private.sync_invoice(OLD.invoice_id); END IF;
 IF TG_OP<>'DELETE' THEN PERFORM commission_private.sync_invoice(NEW.invoice_id); RETURN NEW; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER commission_sync_invoice_lines AFTER INSERT OR UPDATE OR DELETE ON invoice_line_items
 FOR EACH ROW EXECUTE FUNCTION commission_private.sync_related_invoice();
CREATE TRIGGER commission_sync_service_link AFTER INSERT OR UPDATE OR DELETE ON service_billing_queue
 FOR EACH ROW EXECUTE FUNCTION commission_private.sync_related_invoice();

CREATE OR REPLACE FUNCTION commission_private.sync_source_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid; BEGIN
 FOR target IN SELECT i.id FROM invoices i WHERE i.organization_id=NEW.organization_id AND
  CASE TG_TABLE_NAME WHEN 'projects' THEN i.project_id=NEW.id
   WHEN 'sales_orders' THEN i.sales_order_id=NEW.id OR i.project_id IN(SELECT id FROM projects WHERE sales_order_id=NEW.id)
   WHEN 'proposals' THEN i.proposal_id=NEW.id
   WHEN 'work_orders' THEN i.commission_work_order_id=NEW.id OR i.id IN(SELECT invoice_id FROM service_billing_queue WHERE work_order_id=NEW.id)
  END ORDER BY i.id LOOP PERFORM commission_private.sync_invoice(target); END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER commission_sync_project_roles AFTER UPDATE OF salesperson_id,assigned_pm,designer_id,sales_order_id ON projects
 FOR EACH ROW EXECUTE FUNCTION commission_private.sync_source_change();
CREATE TRIGGER commission_sync_order_rep AFTER UPDATE OF sales_rep_id ON sales_orders
 FOR EACH ROW EXECUTE FUNCTION commission_private.sync_source_change();
CREATE TRIGGER commission_sync_proposal_rep AFTER UPDATE OF created_by ON proposals
 FOR EACH ROW EXECUTE FUNCTION commission_private.sync_source_change();
CREATE TRIGGER commission_sync_work_order_rep AFTER UPDATE OF customer_sales_rep_id ON work_orders
 FOR EACH ROW EXECUTE FUNCTION commission_private.sync_source_change();

-- The invoice receives only principal; convenience fees remain on the receipt.
CREATE OR REPLACE FUNCTION public.update_invoice_payment_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ids uuid[]; target uuid; total_amount numeric; paid numeric; old_status text; BEGIN
 IF TG_OP='INSERT' THEN ids:=ARRAY[NEW.invoice_id];
 ELSIF TG_OP='DELETE' THEN ids:=ARRAY[OLD.invoice_id]; ELSE ids:=ARRAY[OLD.invoice_id,NEW.invoice_id]; END IF;
 FOR target IN SELECT DISTINCT v FROM unnest(ids) v WHERE v IS NOT NULL ORDER BY v LOOP
  SELECT total,status INTO total_amount,old_status FROM invoices WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT COALESCE(sum(amount-convenience_fee_amount),0) INTO paid FROM payments WHERE invoice_id=target;
  UPDATE invoices SET amount_paid=paid,amount_due=GREATEST(0,total_amount-paid),
   status=CASE WHEN old_status IN ('void','voided','cancelled') THEN old_status
    WHEN paid<=0 THEN 'submitted' WHEN paid>=total_amount THEN 'paid' ELSE 'partial' END,updated_at=now() WHERE id=target;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- Internal mutation functions are never directly callable through PostgREST.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA commission_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION commission_private.can_manage(uuid),commission_private.is_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_commission_records_for_invoice(),public.update_commission_on_payment(),public.update_invoice_payment_status() FROM PUBLIC,anon,authenticated;

-- Payment-dated report from the same frozen rates/base as the ledger. Compute
-- rounded cumulative differences so installments and refunds sum exactly.
CREATE OR REPLACE FUNCTION public.get_commission_period_report(p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid; manager boolean; rows jsonb; legacy_count integer;
BEGIN
 SELECT organization_id INTO org FROM profiles WHERE id=auth.uid() AND is_active IS TRUE;
 IF org IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Invalid commission report period'; END IF;
 manager:=commission_private.can_manage(org);
 WITH collections AS (
  SELECT p.*,sum(p.amount-p.convenience_fee_amount) OVER(PARTITION BY p.invoice_id ORDER BY p.payment_date,p.created_at,p.id) AS cumulative
  FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.organization_id=org
  WHERE p.organization_id=org AND p.payment_date<=p_end AND p.invoice_id IN
   (SELECT invoice_id FROM payments WHERE organization_id=org AND payment_date BETWEEN p_start AND p_end)
 ), shares AS (
  SELECT p.*,GREATEST(0,LEAST(p.cumulative/NULLIF(i.total,0),1)) AS current_share,
   GREATEST(0,LEAST((p.cumulative-p.amount+p.convenience_fee_amount)/NULLIF(i.total,0),1)) AS previous_share
  FROM collections p JOIN invoices i ON i.id=p.invoice_id WHERE i.total>0 AND i.status NOT IN ('draft','void','voided','cancelled')
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'commissionRecordId',c.id,'collectionId',p.id,'invoiceId',i.id,'invoiceNumber',i.invoice_number,
  'customerName',COALESCE(ct.full_name,ct.contact_name,'Customer'),'invoiceDate',i.invoice_date,'paymentDate',p.payment_date,
  'paymentMethod',p.payment_method,'grossSale',round(i.subtotal*(p.current_share-p.previous_share),2),
  'taxAmount',round(i.tax_amount*(p.current_share-p.previous_share),2),
  'ccFeeDeducted',CASE WHEN c.basis_type='profit' THEN 0 ELSE round((i.subtotal-c.basis_amount)*(p.current_share-p.previous_share),2) END,
  'netCommissionable',round(c.basis_amount*(p.current_share-p.previous_share),2),
  'employeeId',COALESCE(c.employee_id::text,'service_department'),'employeeName',CASE WHEN c.recipient_type='service_department' THEN 'Service Department' ELSE COALESCE(ep.full_name,'Former employee') END,
  'roleType',c.role_type,'originalRate',c.commission_rate,'effectiveRate',c.commission_rate,
  'commissionAmount',round(c.basis_amount*c.commission_rate/100*p.current_share,2)-round(c.basis_amount*c.commission_rate/100*p.previous_share,2),
  'isSplit',false,'splitGroupKey',i.id,'approvalStatus',c.approval_status
 ) ORDER BY p.payment_date,p.id,c.id),'[]'::jsonb) INTO rows
 FROM shares p JOIN invoices i ON i.id=p.invoice_id
 JOIN commission_records c ON c.invoice_id=i.id AND c.organization_id=org AND c.calculation_revision=2
 LEFT JOIN contacts ct ON ct.id=i.contact_id AND ct.organization_id=org
 LEFT JOIN profiles ep ON ep.id=c.employee_id AND ep.organization_id=org
 WHERE p.payment_date BETWEEN p_start AND p_end AND (manager OR c.employee_id=auth.uid());
 SELECT count(DISTINCT c.id) INTO legacy_count FROM commission_records c JOIN payments p ON p.invoice_id=c.invoice_id
 WHERE c.organization_id=org AND c.calculation_revision=1 AND p.payment_date BETWEEN p_start AND p_end
 AND (manager OR c.employee_id=auth.uid());
 RETURN jsonb_build_object('lines',rows,'legacyCount',legacy_count,'adjustmentCount',
  (SELECT count(*) FROM commission_report_deductions d WHERE d.organization_id=org AND d.period_start<=p_end AND d.period_end>=p_start
    AND (manager OR d.employee_id=auth.uid()))+
  (SELECT count(*) FROM commission_report_rate_overrides o JOIN payments p ON p.invoice_id=o.invoice_id
    WHERE o.organization_id=org AND p.payment_date BETWEEN p_start AND p_end AND (manager OR o.employee_id=auth.uid())));
END $$;
REVOKE ALL ON FUNCTION public.get_commission_period_report(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_commission_period_report(date,date) TO authenticated;
