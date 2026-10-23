DO $preflight$ BEGIN
IF pg_get_functiondef('public.handle_unified_proposal_approval()'::regprocedure) IS DISTINCT FROM 'CREATE OR REPLACE FUNCTION public.handle_unified_proposal_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''public''
AS $function$
DECLARE
v_sales_order_id      uuid;
v_order_number        text;
v_invoice_id          uuid;
v_invoice_number      text;
v_deposit_amount      numeric;
v_require_deposit     boolean;
v_accepted_via_method text;
v_customer_name       text;
v_sales_order_status  text;
v_project_id          uuid;
v_project_number      text;
BEGIN
IF NEW.status = ''approved''
AND OLD.status != ''approved''
AND NEW.sales_order_id IS NULL
AND (NEW.billing_action_taken = false OR NEW.sales_order_id IS NULL)
THEN

BEGIN

SELECT COALESCE(full_name, contact_name, email, ''Customer'')
INTO v_customer_name
FROM contacts
WHERE id = NEW.contact_id;

v_require_deposit     := COALESCE(NEW.require_deposit, true);
v_deposit_amount      := COALESCE(NEW.deposit_amount_due, 0);
v_accepted_via_method := COALESCE(NEW.accepted_via_method, ''verbal'');

IF NEW.accepted_via_method IS NULL THEN
NEW.accepted_via_method := ''verbal'';
END IF;

IF NEW.approval_completed_at IS NULL THEN
NEW.approval_completed_at := now();
END IF;

v_order_number := generate_sales_order_number(NEW.proposal_number);

IF v_accepted_via_method = ''purchase_order'' THEN
v_sales_order_status    := ''planning'';
NEW.billing_action_type := ''purchase_order'';

IF NEW.purchase_order_number IS NULL OR NEW.purchase_order_number = '''' THEN
RAISE EXCEPTION ''Purchase Order number is required for PO acceptance'';
END IF;

ELSIF NOT v_require_deposit THEN
v_sales_order_status    := ''planning'';
NEW.billing_action_type := ''no_deposit_required'';

ELSIF NEW.deposit_paid THEN
v_sales_order_status    := ''planning'';
NEW.billing_action_type := ''deposit_invoice'';

IF v_deposit_amount > 0 THEN
v_invoice_number := generate_invoice_number();

INSERT INTO invoices (
company_id, organization_id,
proposal_id, contact_id,
invoice_number, invoice_type,
invoice_date, due_date, source_type,
subtotal, tax_amount, tax_rate,
tax_environment, tax_project_type,
total, amount_due, status, payment_terms, notes, created_by
) VALUES (
NEW.company_id, NEW.organization_id,
NEW.id, NEW.contact_id,
v_invoice_number, ''deposit'',
CURRENT_DATE, CURRENT_DATE, ''deposit'',
v_deposit_amount, 0, COALESCE(NEW.tax_rate, 0),
COALESCE(NEW.tax_environment, ''residential''),
COALESCE(NEW.tax_project_type, ''general_installation_repair''),
v_deposit_amount, 0, ''paid'', ''Paid'',
''Deposit payment received for '' || v_customer_name,
NEW.approved_by
) RETURNING id INTO v_invoice_id;

INSERT INTO invoice_line_items (
invoice_id, organization_id,
description, quantity, unit_price, amount, is_taxable
) VALUES (
v_invoice_id, NEW.organization_id,
''Deposit for Proposal '' || NEW.proposal_number,
1, v_deposit_amount, v_deposit_amount, false
);

INSERT INTO invoice_payments (
company_id, invoice_id, proposal_id,
payment_date, amount, payment_method, reference_number, notes, created_by
) VALUES (
NEW.company_id, v_invoice_id, NEW.id,
COALESCE(NEW.deposit_payment_date, CURRENT_DATE),
v_deposit_amount, ''other'',
''Deposit - Proposal '' || NEW.proposal_number,
''Deposit payment recorded at approval'',
NEW.approved_by
);

NEW.deposit_invoice_id := v_invoice_id;
END IF;

ELSE
v_sales_order_status        := ''pending_deposit'';
NEW.billing_action_type     := ''deposit_invoice'';
NEW.deposit_request_sent    := true;
NEW.deposit_request_sent_at := now();

IF v_deposit_amount > 0 THEN
v_invoice_number := generate_invoice_number();

INSERT INTO invoices (
company_id, organization_id,
proposal_id, contact_id,
invoice_number, invoice_type,
invoice_date, due_date, source_type,
subtotal, tax_amount, tax_rate,
tax_environment, tax_project_type,
total, amount_due, status, payment_terms, notes, created_by
) VALUES (
NEW.company_id, NEW.organization_id,
NEW.id, NEW.contact_id,
v_invoice_number, ''deposit'',
CURRENT_DATE, CURRENT_DATE, ''deposit'',
v_deposit_amount, 0, COALESCE(NEW.tax_rate, 0),
COALESCE(NEW.tax_environment, ''residential''),
COALESCE(NEW.tax_project_type, ''general_installation_repair''),
v_deposit_amount, v_deposit_amount, ''submitted'', ''Due upon receipt'',
''Deposit invoice for '' || v_customer_name,
NEW.approved_by
) RETURNING id INTO v_invoice_id;

INSERT INTO invoice_line_items (
invoice_id, organization_id,
description, quantity, unit_price, amount, is_taxable
) VALUES (
v_invoice_id, NEW.organization_id,
''Deposit for Proposal '' || NEW.proposal_number,
1, v_deposit_amount, v_deposit_amount, false
);

NEW.deposit_invoice_id := v_invoice_id;
END IF;
END IF;

-- Create Sales Order (copy portal_template_override_id from proposal''s report_template_id)
INSERT INTO sales_orders (
company_id, organization_id,
proposal_id, contact_id,
order_number, status,
contract_total, payment_terms, notes, created_by,
portal_template_override_id
) VALUES (
NEW.company_id, NEW.organization_id,
NEW.id, NEW.contact_id,
v_order_number, v_sales_order_status,
NEW.total,
COALESCE(NEW.payment_terms, ''Net 30''),
CASE
WHEN v_accepted_via_method = ''purchase_order'' THEN
''Converted from proposal '' || NEW.proposal_number || '' - PO: '' || NEW.purchase_order_number
WHEN NEW.deposit_paid THEN
''Converted from proposal '' || NEW.proposal_number || '' - Deposit received''
WHEN v_require_deposit AND NOT NEW.deposit_paid THEN
''Converted from proposal '' || NEW.proposal_number || '' - Pending deposit payment''
ELSE
''Converted from proposal '' || NEW.proposal_number
END,
NEW.approved_by,
NEW.report_template_id
) RETURNING id INTO v_sales_order_id;

NEW.sales_order_id := v_sales_order_id;

-- Link deposit invoice to sales order
IF v_invoice_id IS NOT NULL THEN
UPDATE invoices SET sales_order_id = v_sales_order_id WHERE id = v_invoice_id;
END IF;

-- Create Project linked to this sales order
BEGIN
v_project_number := get_next_project_number();

INSERT INTO projects (
company_id, organization_id,
sales_order_id, contact_id,
project_number, name,
status, assigned_pm,
job_site_address, notes, created_by,
salesperson_id
) VALUES (
NEW.company_id, NEW.organization_id,
v_sales_order_id, NEW.contact_id,
v_project_number,
COALESCE(NEW.title, ''Project for '' || v_customer_name),
''planning'',
NEW.created_by,
NEW.jobsite_location,
''Project created from approved proposal '' || NEW.proposal_number,
NEW.approved_by,
NEW.created_by
) RETURNING id INTO v_project_id;

UPDATE sales_orders SET project_id = v_project_id WHERE id = v_sales_order_id;

IF v_invoice_id IS NOT NULL THEN
UPDATE invoices SET project_id = v_project_id WHERE id = v_invoice_id;
END IF;

EXCEPTION WHEN OTHERS THEN
RAISE EXCEPTION ''Failed to create project for proposal %: %'', NEW.proposal_number, SQLERRM;
END;

NEW.billing_action_taken := true;
NEW.billing_action_at    := now();
NEW.billing_action_by    := NEW.approved_by;

IF NEW.approved_by IS DISTINCT FROM NEW.created_by THEN
BEGIN
INSERT INTO notifications (user_id, type, title, message, related_id)
VALUES (
NEW.created_by,
''proposal_approved'',
''Customer Approved Proposal'',
v_customer_name || '' approved proposal '' || NEW.proposal_number || ''. '' ||
CASE
WHEN v_accepted_via_method = ''purchase_order'' THEN
''Sales order created with PO #'' || NEW.purchase_order_number || '' and is ready for scheduling.''
WHEN NEW.deposit_paid THEN
''Deposit received. Sales order created and ready for scheduling.''
WHEN v_require_deposit AND NOT NEW.deposit_paid THEN
''Deposit invoice created and sent. Sales order pending deposit payment.''
ELSE
''Sales order created and ready for scheduling.''
END,
NEW.id
);
EXCEPTION WHEN OTHERS THEN
RAISE WARNING ''Failed to create notification: %'', SQLERRM;
END;
END IF;

EXCEPTION WHEN OTHERS THEN
RAISE EXCEPTION ''Proposal approval failed while creating sales order: %'', SQLERRM;
END;

END IF;

RETURN NEW;
END;
$function$
' THEN RAISE EXCEPTION 'Approval trigger changed since review';END IF;
IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261022100000','20261022101500','20261022160000','20261022163000','20261022170000','20261022190730')) THEN RAISE EXCEPTION 'Migration history changed';END IF;
END $preflight$;
-- Extend the existing verified-customer engagement heartbeat for Our Promise reconsideration.
-- Keep all authorization, ownership, time bounds, and cumulative snapshot checks intact.
CREATE OR REPLACE FUNCTION private.report_proposal_engagement(p_activity_id uuid,p_seconds integer,p_sections jsonb,p_clicks jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.proposal_activity; v_key text; v_value jsonb; v_sections jsonb='{}';
  v_clicks jsonb='{}'; v_count integer; v_total integer=0; v_old integer;
BEGIN
  SELECT * INTO v_row FROM public.proposal_activity WHERE id=p_activity_id AND viewer_user_id=auth.uid()
    AND activity_type='viewed' AND visit_id IS NOT NULL FOR UPDATE;
  IF v_row.id IS NULL OR NOT private.proposal_engagement_customer(v_row.proposal_id) THEN RETURN false; END IF;
  IF p_seconds IS NULL OR p_seconds<0 OR p_seconds>86400
    OR p_seconds>ceil(extract(epoch FROM (clock_timestamp()-v_row.created_at)))+2
    OR jsonb_typeof(p_sections) IS DISTINCT FROM 'object' OR jsonb_typeof(p_clicks) IS DISTINCT FROM 'object'
    OR octet_length(p_sections::text)>20000 OR octet_length(p_clicks::text)>2000 THEN RETURN false; END IF;
  IF p_seconds<coalesce(v_row.duration_seconds,0) THEN RETURN true; END IF;
  FOR v_key,v_value IN SELECT * FROM jsonb_each(p_sections) LOOP
    IF jsonb_typeof(v_value)<>'number' OR v_value::text !~ '^[0-9]{1,5}$' THEN RETURN false; END IF;
    v_count=v_value::text::integer;
    IF v_count>p_seconds THEN RETURN false; END IF;
    IF v_key NOT IN ('scope','pricing','actions','notes','video','promise') AND NOT EXISTS(
      SELECT 1 FROM public.proposal_rooms r WHERE r.proposal_id=v_row.proposal_id AND 'room:'||r.id::text=v_key
    ) THEN RETURN false; END IF;
    v_old=coalesce((v_row.metadata->'engagement'->'sections'->>v_key)::integer,0);
    v_count=greatest(v_count,v_old); v_total=v_total+v_count;
    v_sections=v_sections||jsonb_build_object(v_key,v_count);
  END LOOP;
  FOR v_key,v_value IN SELECT * FROM jsonb_each(coalesce(v_row.metadata->'engagement'->'sections','{}')) LOOP
    IF NOT v_sections ? v_key THEN v_sections=v_sections||jsonb_build_object(v_key,v_value); v_total=v_total+v_value::text::integer; END IF;
  END LOOP;
  IF v_total>p_seconds THEN RETURN false; END IF;
  FOR v_key,v_value IN SELECT * FROM jsonb_each(p_clicks) LOOP
    IF v_key NOT IN ('download_clicked','approval_clicked','payment_clicked','question_clicked','change_request_clicked','decline_clicked','decline_to_changes_clicked','decline_to_approval_clicked','decline_rep_call_clicked','decline_rep_email_clicked','decline_continue_clicked','video_opened','video_played')
      OR jsonb_typeof(v_value)<>'number' OR v_value::text !~ '^[0-9]{1,5}$' THEN RETURN false; END IF;
    v_count=v_value::text::integer; IF v_count>10000 THEN RETURN false; END IF;
    v_clicks=v_clicks||jsonb_build_object(v_key,greatest(v_count,coalesce((v_row.metadata->'engagement'->'clicks'->>v_key)::integer,0)));
  END LOOP;
  v_clicks=coalesce(v_row.metadata->'engagement'->'clicks','{}')||v_clicks;
  UPDATE public.proposal_activity SET duration_seconds=p_seconds,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('engagement',jsonb_build_object('trackingVersion',1,'sections',v_sections,'clicks',v_clicks))
    WHERE id=v_row.id;
  RETURN true;
END $$;

ALTER TABLE public.proposal_activity DROP CONSTRAINT proposal_activity_activity_type_check;
ALTER TABLE public.proposal_activity ADD CONSTRAINT proposal_activity_activity_type_check CHECK(activity_type IN ('viewed','downloaded','shared','accepted','declined','time_spent','decision_step'));
-- Record an ordered decision path only for authenticated, verified proposal customers.
-- Never trust a supplied proposal ID or actor without checking portal ownership.
CREATE OR REPLACE FUNCTION public.record_proposal_decision_step(p_proposal_id uuid, p_step text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_step IS NULL OR p_step NOT IN ('decline_started','decline_to_changes','decline_to_approval','decline_acknowledged','decline_cancelled','change_request_submitted')
     OR NOT private.proposal_engagement_customer(p_proposal_id) THEN RETURN false; END IF;
  INSERT INTO public.proposal_activity(organization_id,proposal_id,activity_type,viewer_user_id,portal_version_number,metadata)
  SELECT p.organization_id,p.id,'decision_step',auth.uid(),p.current_portal_version,jsonb_build_object('step',p_step,'source','customer_portal') FROM public.proposals p WHERE p.id=p_proposal_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_proposal_decision_step(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_proposal_decision_step(uuid,text) TO authenticated;

-- Existing missing representatives were explicitly assigned by the owner before
-- rollout. Fail rather than create any exception for an unassigned customer.
ALTER TABLE public.contacts ADD CONSTRAINT contacts_customer_rep_office_required
 CHECK(contact_type IS NOT NULL AND (contact_type IN ('lead','prospect') OR
 (contact_type IN ('person','business') AND assigned_to IS NOT NULL AND office_id IS NOT NULL)));

-- Enforce customer assignments, including trusted imports and ownership changes.
CREATE OR REPLACE FUNCTION public.validate_customer_owner_office() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.contact_type IS NOT DISTINCT FROM OLD.contact_type AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to AND NEW.office_id IS NOT DISTINCT FROM OLD.office_id AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN RETURN NEW;END IF;
 IF NEW.contact_type IS NULL OR NEW.contact_type NOT IN ('lead','prospect','person','business') THEN RAISE EXCEPTION 'Valid contact type required' USING ERRCODE='23514';END IF;
 IF NEW.contact_type IN ('person','business') AND (NEW.organization_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.assigned_to AND p.organization_id=NEW.organization_id AND p.is_active AND p.role NOT IN ('portal_user','customer')) OR NOT EXISTS(SELECT 1 FROM public.company_offices o WHERE o.id=NEW.office_id AND o.organization_id=NEW.organization_id)) THEN RAISE EXCEPTION 'Customers require an active representative and office in their organization' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_customer_owner_office() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_customer_owner_office_trigger BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.validate_customer_owner_office();

-- Read-only administrator audit for customer ownership before validation.
-- No records are reassigned automatically.
CREATE OR REPLACE VIEW public.customer_assignment_audit
WITH (security_invoker = true)
AS
SELECT c.id AS contact_id,
       c.organization_id,
       c.contact_type,
       c.assigned_to AS assigned_rep_id,
       c.office_id,
       CASE WHEN c.organization_id IS NULL THEN 'missing_organization' ELSE NULL END AS organization_issue,
       CASE
         WHEN c.assigned_to IS NULL THEN 'missing_rep'
         WHEN p.id IS NULL THEN 'rep_not_found'
         WHEN p.organization_id IS DISTINCT FROM c.organization_id THEN 'rep_wrong_organization'
         WHEN p.is_active IS NOT TRUE OR p.role IN ('portal_user','customer') THEN 'rep_inactive_or_customer'
         ELSE NULL
       END AS rep_issue,
       CASE
         WHEN c.office_id IS NULL THEN 'missing_office'
         WHEN o.id IS NULL THEN 'office_not_found'
         WHEN o.organization_id IS DISTINCT FROM c.organization_id THEN 'office_wrong_organization'
         ELSE NULL
       END AS office_issue
FROM public.contacts c
LEFT JOIN public.profiles p ON p.id = c.assigned_to
LEFT JOIN public.company_offices o ON o.id = c.office_id
WHERE c.contact_type IN ('person', 'business')
  AND (c.organization_id IS NULL OR c.assigned_to IS NULL OR c.office_id IS NULL
       OR p.organization_id IS DISTINCT FROM c.organization_id
       OR o.organization_id IS DISTINCT FROM c.organization_id OR p.is_active IS NOT TRUE OR p.role IN ('portal_user','customer'));

-- This is an internal audit, not a customer-facing API endpoint.
REVOKE ALL ON public.customer_assignment_audit FROM PUBLIC, anon, authenticated;
-- The view uses invoker security; only privileged database operators should query it.
-- Run as database administrator:
-- SELECT organization_issue, rep_issue, office_issue, count(*) FROM public.customer_assignment_audit
-- GROUP BY organization_issue, rep_issue, office_issue ORDER BY count(*) DESC;
-- Once the view returns zero rows:
-- ALTER TABLE public.contacts VALIDATE CONSTRAINT contacts_customer_rep_office_required;

CREATE OR REPLACE FUNCTION public.handle_unified_proposal_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_sales_order_id      uuid;
v_order_number        text;
v_invoice_id          uuid;
v_invoice_number      text;
v_deposit_amount      numeric;
v_require_deposit     boolean;
v_accepted_via_method text;
v_customer_name       text;
v_sales_order_status  text;
v_project_id          uuid;
v_project_number      text;
BEGIN
IF NEW.status = 'approved'
AND OLD.status != 'approved'
AND NEW.sales_order_id IS NULL
AND (NEW.billing_action_taken = false OR NEW.sales_order_id IS NULL)
THEN

BEGIN

SELECT COALESCE(full_name, contact_name, email, 'Customer')
INTO v_customer_name
FROM contacts
WHERE id = NEW.contact_id;

v_require_deposit     := COALESCE(NEW.require_deposit, true);
v_deposit_amount      := COALESCE(NEW.deposit_amount_due, 0);
v_accepted_via_method := COALESCE(NEW.accepted_via_method, 'verbal');

IF NEW.accepted_via_method IS NULL THEN
NEW.accepted_via_method := 'verbal';
END IF;

IF NEW.approval_completed_at IS NULL THEN
NEW.approval_completed_at := now();
END IF;

v_order_number := generate_sales_order_number(NEW.proposal_number);

IF v_accepted_via_method = 'purchase_order' THEN
v_sales_order_status    := 'planning';
NEW.billing_action_type := 'purchase_order';

IF NEW.purchase_order_number IS NULL OR NEW.purchase_order_number = '' THEN
RAISE EXCEPTION 'Purchase Order number is required for PO acceptance';
END IF;

ELSIF NOT v_require_deposit THEN
v_sales_order_status    := 'planning';
NEW.billing_action_type := 'no_deposit_required';

ELSIF NEW.deposit_paid THEN
v_sales_order_status    := 'planning';
NEW.billing_action_type := 'deposit_invoice';

IF v_deposit_amount > 0 THEN
v_invoice_number := generate_invoice_number();

INSERT INTO invoices (
company_id, organization_id,
proposal_id, contact_id,
invoice_number, invoice_type,
invoice_date, due_date, source_type,
subtotal, tax_amount, tax_rate,
tax_environment, tax_project_type,
total, amount_due, status, payment_terms, notes, created_by
) VALUES (
NEW.company_id, NEW.organization_id,
NEW.id, NEW.contact_id,
v_invoice_number, 'deposit',
CURRENT_DATE, CURRENT_DATE, 'deposit',
v_deposit_amount, 0, COALESCE(NEW.tax_rate, 0),
COALESCE(NEW.tax_environment, 'residential'),
COALESCE(NEW.tax_project_type, 'general_installation_repair'),
v_deposit_amount, 0, 'paid', 'Paid',
'Deposit payment received for ' || v_customer_name,
NEW.approved_by
) RETURNING id INTO v_invoice_id;

INSERT INTO invoice_line_items (
invoice_id, organization_id,
description, quantity, unit_price, amount, is_taxable
) VALUES (
v_invoice_id, NEW.organization_id,
'Deposit for Proposal ' || NEW.proposal_number,
1, v_deposit_amount, v_deposit_amount, false
);

INSERT INTO invoice_payments (
company_id, invoice_id, proposal_id,
payment_date, amount, payment_method, reference_number, notes, created_by
) VALUES (
NEW.company_id, v_invoice_id, NEW.id,
COALESCE(NEW.deposit_payment_date, CURRENT_DATE),
v_deposit_amount, 'other',
'Deposit - Proposal ' || NEW.proposal_number,
'Deposit payment recorded at approval',
NEW.approved_by
);

NEW.deposit_invoice_id := v_invoice_id;
END IF;

ELSE
v_sales_order_status        := 'pending_deposit';
NEW.billing_action_type     := 'deposit_invoice';
NEW.deposit_request_sent    := true;
NEW.deposit_request_sent_at := now();

IF v_deposit_amount > 0 THEN
v_invoice_number := generate_invoice_number();

INSERT INTO invoices (
company_id, organization_id,
proposal_id, contact_id,
invoice_number, invoice_type,
invoice_date, due_date, source_type,
subtotal, tax_amount, tax_rate,
tax_environment, tax_project_type,
total, amount_due, status, payment_terms, notes, created_by
) VALUES (
NEW.company_id, NEW.organization_id,
NEW.id, NEW.contact_id,
v_invoice_number, 'deposit',
CURRENT_DATE, CURRENT_DATE, 'deposit',
v_deposit_amount, 0, COALESCE(NEW.tax_rate, 0),
COALESCE(NEW.tax_environment, 'residential'),
COALESCE(NEW.tax_project_type, 'general_installation_repair'),
v_deposit_amount, v_deposit_amount, 'submitted', 'Due upon receipt',
'Deposit invoice for ' || v_customer_name,
NEW.approved_by
) RETURNING id INTO v_invoice_id;

INSERT INTO invoice_line_items (
invoice_id, organization_id,
description, quantity, unit_price, amount, is_taxable
) VALUES (
v_invoice_id, NEW.organization_id,
'Deposit for Proposal ' || NEW.proposal_number,
1, v_deposit_amount, v_deposit_amount, false
);

NEW.deposit_invoice_id := v_invoice_id;
END IF;
END IF;

-- Create Sales Order (copy portal_template_override_id from proposal's report_template_id)
INSERT INTO sales_orders (
company_id, organization_id,
proposal_id, contact_id,
order_number, status,
contract_total, payment_terms, notes, created_by,
portal_template_override_id
) VALUES (
NEW.company_id, NEW.organization_id,
NEW.id, NEW.contact_id,
v_order_number, v_sales_order_status,
NEW.total,
COALESCE(NEW.payment_terms, 'Net 30'),
CASE
WHEN v_accepted_via_method = 'purchase_order' THEN
'Converted from proposal ' || NEW.proposal_number || ' - PO: ' || NEW.purchase_order_number
WHEN NEW.deposit_paid THEN
'Converted from proposal ' || NEW.proposal_number || ' - Deposit received'
WHEN v_require_deposit AND NOT NEW.deposit_paid THEN
'Converted from proposal ' || NEW.proposal_number || ' - Pending deposit payment'
ELSE
'Converted from proposal ' || NEW.proposal_number
END,
NEW.approved_by,
NEW.report_template_id
) RETURNING id INTO v_sales_order_id;

NEW.sales_order_id := v_sales_order_id;

-- Link deposit invoice to sales order
IF v_invoice_id IS NOT NULL THEN
UPDATE invoices SET sales_order_id = v_sales_order_id WHERE id = v_invoice_id;
END IF;

-- Create Project linked to this sales order
BEGIN
v_project_number := get_next_project_number();

INSERT INTO projects (
company_id, organization_id,
sales_order_id, contact_id,
project_number, name,
status, assigned_pm,
job_site_address, notes, created_by,
salesperson_id
) VALUES (
NEW.company_id, NEW.organization_id,
v_sales_order_id, NEW.contact_id,
v_project_number,
COALESCE(NEW.title, 'Project for ' || v_customer_name),
'planning',
NEW.created_by,
jsonb_build_object('street',NEW.jobsite_address,'city',NEW.jobsite_city,'state',NEW.jobsite_state,'zip',NEW.jobsite_zip),
'Project created from approved proposal ' || NEW.proposal_number,
NEW.approved_by,
(SELECT assigned_to FROM contacts WHERE id=NEW.contact_id AND organization_id=NEW.organization_id)
) RETURNING id INTO v_project_id;

UPDATE sales_orders SET project_id = v_project_id WHERE id = v_sales_order_id;

IF v_invoice_id IS NOT NULL THEN
UPDATE invoices SET project_id = v_project_id WHERE id = v_invoice_id;
END IF;

EXCEPTION WHEN OTHERS THEN
RAISE EXCEPTION 'Failed to create project for proposal %: %', NEW.proposal_number, SQLERRM;
END;

NEW.billing_action_taken := true;
NEW.billing_action_at    := now();
NEW.billing_action_by    := NEW.approved_by;

IF NEW.approved_by IS DISTINCT FROM (SELECT assigned_to FROM contacts WHERE id=NEW.contact_id AND organization_id=NEW.organization_id) THEN
BEGIN
INSERT INTO notifications (organization_id, user_id, type, title, body, related_id)
VALUES (
NEW.organization_id,
(SELECT assigned_to FROM contacts WHERE id=NEW.contact_id AND organization_id=NEW.organization_id),
'proposal_approval',
'Customer Approved Proposal',
v_customer_name || ' approved proposal ' || NEW.proposal_number || '. ' ||
CASE
WHEN v_accepted_via_method = 'purchase_order' THEN
'Sales order created with PO #' || NEW.purchase_order_number || ' and is ready for scheduling.'
WHEN NEW.deposit_paid THEN
'Deposit received. Sales order created and ready for scheduling.'
WHEN v_require_deposit AND NOT NEW.deposit_paid THEN
'Deposit invoice created and sent. Sales order pending deposit payment.'
ELSE
'Sales order created and ready for scheduling.'
END,
NEW.id
);
EXCEPTION WHEN OTHERS THEN
RAISE WARNING 'Failed to create notification: %', SQLERRM;
END;
END IF;

EXCEPTION WHEN OTHERS THEN
RAISE EXCEPTION 'Proposal approval failed while creating sales order: %', SQLERRM;
END;

END IF;

RETURN NEW;
END;
$function$;


-- Customer decisions preserve the existing approval trigger, loss feedback and
-- message notification contracts, with authorization and retries at one boundary.
ALTER TABLE public.proposals ADD COLUMN customer_change_requested_at timestamptz,
 ADD COLUMN customer_change_requested_version integer;
CREATE TABLE private.proposal_customer_decisions (
 proposal_id uuid NOT NULL REFERENCES public.proposals(id), request_id uuid NOT NULL,
 viewer_id uuid NOT NULL, portal_version integer NOT NULL, action text NOT NULL,
 details jsonb NOT NULL, result jsonb NOT NULL, evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(proposal_id,request_id)
);
ALTER TABLE private.proposal_customer_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.proposal_customer_decisions FROM PUBLIC,anon,authenticated;
CREATE POLICY server_decisions ON private.proposal_customer_decisions TO service_role USING(true) WITH CHECK(true);
GRANT ALL ON private.proposal_customer_decisions TO service_role;

CREATE FUNCTION private.verified_proposal_customer(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.proposals p JOIN public.contacts c ON c.id=p.contact_id AND c.organization_id=p.organization_id
  WHERE p.id=p_id AND p.is_portal_visible AND c.portal_user_id=auth.uid()
 ) AND NOT EXISTS(SELECT 1 FROM public.profiles u WHERE u.id=auth.uid() AND (u.role IS NULL OR u.role NOT IN ('portal_user','customer') OR u.is_active IS NOT TRUE));
$$;
REVOKE ALL ON FUNCTION private.verified_proposal_customer(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.proposal_engagement_customer(p_proposal_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT private.verified_proposal_customer(p_proposal_id)$$;


-- The canonical loss-feedback API supports verified customers as well as its
-- existing employee callers. Existing feedback and follow-up suppression remain.
ALTER TABLE public.proposal_loss_feedback DROP CONSTRAINT proposal_loss_feedback_source_check;
ALTER TABLE public.proposal_loss_feedback ADD CONSTRAINT proposal_loss_feedback_source_check CHECK(source IN ('phone','email','in_person','staff_assessment','customer_portal'));
CREATE FUNCTION private.apply_proposal_decline(p_proposal_id uuid,p_reason text,p_notes text,p_source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.proposals; feedback_id uuid; customer boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 customer:=private.verified_proposal_customer(p_proposal_id);
 SELECT * INTO p FROM public.proposals WHERE id=p_proposal_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposal access required' USING ERRCODE='42501'; END IF;
 IF customer THEN
  IF p_source IS DISTINCT FROM 'customer_portal' THEN RAISE EXCEPTION 'Customer feedback source required';END IF;
  IF p.status='declined' THEN SELECT id INTO feedback_id FROM public.proposal_loss_feedback WHERE proposal_id=p.id AND source='customer_portal' ORDER BY created_at DESC LIMIT 1;IF feedback_id IS NOT NULL THEN RETURN feedback_id;END IF;END IF;
  IF p.status NOT IN ('sent','viewed','portal') OR NOT p.is_active_revision OR p.sent_at IS NULL OR p.expires_at IS NULL OR p.expires_at<=now() THEN RAISE EXCEPTION 'Proposal no longer available for decline';END IF;
 ELSE
  IF NOT public.flow_has_module_access('proposals') OR NOT EXISTS(SELECT 1 FROM public.profiles u WHERE u.id=auth.uid() AND u.is_active AND u.organization_id=p.organization_id AND (p.created_by=u.id OR u.role IN ('admin','owner','super_admin','manager','sales_manager'))) THEN RAISE EXCEPTION 'Proposal access required' USING ERRCODE='42501';END IF;
  IF p_source IS NULL OR p_source NOT IN ('phone','email','in_person','staff_assessment') THEN RAISE EXCEPTION 'Staff feedback source required';END IF;
  IF p.status IN ('approved','approved_pending_action','cancelled','archived') THEN RAISE EXCEPTION 'Proposal not available for decline';END IF;
 END IF;
 IF p_reason IS NULL OR p_reason NOT IN ('price_too_high','went_with_competitor','project_cancelled','timing','budget_cut','scope_change','changed_mind','dont_want_rep','dont_want_company','value','equipment','communication','process','other','no_response','unknown') OR (customer AND p_reason IN ('no_response','unknown')) OR length(coalesce(p_notes,''))>10000 THEN RAISE EXCEPTION 'Valid decline reason and notes required';END IF;
 IF (SELECT atttypid='uuid'::regtype FROM pg_attribute WHERE attrelid='public.proposals'::regclass AND attname='declined_by' AND NOT attisdropped) THEN
  UPDATE public.proposals SET status='declined',decline_reason=p_reason,decline_notes=nullif(trim(p_notes),''),declined_by=auth.uid(),declined_at=coalesce(declined_at,now()) WHERE id=p.id;
 ELSE
  UPDATE public.proposals SET status='declined',decline_reason=p_reason,decline_notes=nullif(trim(p_notes),''),declined_by=CASE WHEN customer THEN 'customer' ELSE 'rep' END,declined_at=coalesce(declined_at,now()) WHERE id=p.id;
 END IF;
 INSERT INTO public.proposal_loss_feedback(organization_id,proposal_id,source,reasons,notes,recorded_by) VALUES(p.organization_id,p.id,p_source,ARRAY[p_reason],coalesce(trim(p_notes),''),auth.uid()) RETURNING id INTO feedback_id;
 IF customer THEN
  INSERT INTO public.notifications(organization_id,user_id,type,title,body,related_id)
   SELECT p.organization_id,c.assigned_to,'proposal','Customer declined proposal',p.proposal_number||': '||p_reason,p.id FROM public.contacts c JOIN public.profiles u ON u.id=c.assigned_to AND u.organization_id=p.organization_id AND u.is_active AND u.role NOT IN ('portal_user','customer') WHERE c.id=p.contact_id AND c.organization_id=p.organization_id;
  INSERT INTO public.proposal_activity(organization_id,proposal_id,activity_type,viewer_user_id,portal_version_number,metadata) VALUES(p.organization_id,p.id,'declined',auth.uid(),p.current_portal_version,jsonb_build_object('reason',p_reason,'by','customer'));
 END IF;
 RETURN feedback_id;
END $$;
REVOKE ALL ON FUNCTION private.apply_proposal_decline(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.record_proposal_decline(p_proposal_id uuid,p_reason text,p_notes text,p_source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF private.verified_proposal_customer(p_proposal_id) THEN RAISE EXCEPTION 'Use the verified customer decision workflow' USING ERRCODE='42501';END IF;
 RETURN private.apply_proposal_decline(p_proposal_id,p_reason,p_notes,p_source);
END $$;
REVOKE ALL ON FUNCTION public.record_proposal_decline(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_proposal_decline(uuid,text,text,text) TO authenticated;

CREATE FUNCTION private.customer_proposal_thread(p_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.proposals; rep uuid; thread uuid;
BEGIN
 IF NOT private.verified_proposal_customer(p_id) THEN RAISE EXCEPTION 'Customer proposal authorization required' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.proposals WHERE id=p_id FOR UPDATE;
 SELECT u.id INTO rep FROM public.contacts c JOIN public.profiles u ON u.id=c.assigned_to AND u.organization_id=p.organization_id AND u.is_active AND u.role NOT IN ('portal_user','customer') WHERE c.id=p.contact_id AND c.organization_id=p.organization_id;
 IF rep IS NULL THEN RAISE EXCEPTION 'Your customer record needs an assigned representative. Please contact the office.';END IF;
 SELECT id INTO thread FROM public.message_threads WHERE proposal_id=p.id AND organization_id=p.organization_id AND context_type='proposal' AND visibility='public' ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF thread IS NULL THEN INSERT INTO public.message_threads(company_id,organization_id,subject,context_type,context_id,proposal_id,contact_id,assigned_sales_rep_id,visibility,created_by) VALUES(p.company_id,p.organization_id,'Q&A: Proposal '||p.proposal_number,'proposal',p.id,p.id,p.contact_id,rep,'public',auth.uid()) RETURNING id INTO thread;
 ELSE UPDATE public.message_threads SET assigned_sales_rep_id=rep WHERE id=thread;END IF;
 RETURN thread;
END $$;
REVOKE ALL ON FUNCTION private.customer_proposal_thread(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.ensure_customer_proposal_thread(p_proposal_id uuid) RETURNS uuid
 LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT private.customer_proposal_thread(p_proposal_id)$$;
REVOKE ALL ON FUNCTION public.ensure_customer_proposal_thread(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ensure_customer_proposal_thread(uuid) TO authenticated;

CREATE FUNCTION public.submit_customer_proposal_decision(p_proposal_id uuid,p_expected_version integer,p_request_id uuid,p_action text,p_details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.proposals; c public.contacts; receipt private.proposal_customer_decisions;
 outcome jsonb; snapshot jsonb; rep uuid; thread uuid; feedback uuid; method text; allowed text[];
BEGIN
 IF NOT private.verified_proposal_customer(p_proposal_id) THEN RAISE EXCEPTION 'Customer proposal authorization required' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_expected_version IS NULL OR p_action IS NULL OR p_action NOT IN ('approve','decline','request_changes') OR jsonb_typeof(p_details) IS DISTINCT FROM 'object' OR octet_length(p_details::text)>20000 THEN RAISE EXCEPTION 'Invalid decision request';END IF;
 SELECT * INTO p FROM public.proposals WHERE id=p_proposal_id FOR UPDATE;
 IF NOT FOUND OR p_expected_version IS DISTINCT FROM coalesce(p.current_portal_version,0) THEN RAISE EXCEPTION 'Proposal revised; reload the current proposal';END IF;
 SELECT * INTO receipt FROM private.proposal_customer_decisions WHERE proposal_id=p.id AND request_id=p_request_id;
 IF FOUND THEN
  IF receipt.viewer_id IS DISTINCT FROM auth.uid() OR receipt.action IS DISTINCT FROM p_action OR receipt.details IS DISTINCT FROM p_details THEN RAISE EXCEPTION 'Request identifier already used for another decision';END IF;
  RETURN receipt.result;
 END IF;
 IF p.status NOT IN ('sent','viewed','portal') OR NOT p.is_active_revision OR p.sent_at IS NULL OR p.expires_at IS NULL OR p.expires_at<=now() THEN RAISE EXCEPTION 'Proposal is no longer available for this decision';END IF;
 SELECT * INTO c FROM public.contacts WHERE id=p.contact_id AND organization_id=p.organization_id;
 SELECT id INTO rep FROM public.profiles WHERE id=c.assigned_to AND organization_id=p.organization_id AND is_active AND role NOT IN ('portal_user','customer');
 IF rep IS NULL THEN RAISE EXCEPTION 'Your customer record needs an assigned representative. Please contact the office.';END IF;
 snapshot:=jsonb_build_object('proposal',to_jsonb(p),'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order,i.id) FROM public.proposal_line_items i WHERE i.proposal_id=p.id AND i.organization_id=p.organization_id),'rooms',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_order,r.id) FROM public.proposal_rooms r WHERE r.proposal_id=p.id AND r.organization_id=p.organization_id),'settings',(SELECT jsonb_agg(to_jsonb(s)) FROM public.proposal_settings s WHERE s.proposal_id=p.id AND s.organization_id=p.organization_id),'display',public.get_proposal_display_template(p.id,NULL)->'template');
 IF p_action='approve' THEN
  method:=p_details->>'method';
  SELECT coalesce(p.acceptance_methods,s.acceptance_methods,ARRAY['payment']) INTO allowed FROM (SELECT 1) dummy LEFT JOIN public.proposal_settings s ON s.proposal_id=p.id AND s.organization_id=p.organization_id;
  IF method IS NULL OR method NOT IN ('payment','purchase_order') OR NOT method=ANY(allowed) THEN RAISE EXCEPTION 'Acceptance method not allowed';END IF;
  IF method='purchase_order' AND nullif(trim(p_details->>'po_number'),'') IS NULL THEN RAISE EXCEPTION 'Purchase Order number is required';END IF;
  IF nullif(p_details->>'po_document_url','') IS NOT NULL AND p_details->>'po_document_url' !~ '^https://[^[:space:]]+$' THEN RAISE EXCEPTION 'Purchase order document must use HTTPS';END IF;
  IF length(coalesce(p_details->>'po_number',''))>200 OR length(coalesce(p_details->>'po_document_url',''))>2000 THEN RAISE EXCEPTION 'Invalid purchase order details';END IF;
  UPDATE public.proposals SET status='approved',approved_by=auth.uid(),approved_at=now(),approval_completed_at=now(),accepted_via_method=method,
   purchase_order_number=CASE WHEN method='purchase_order' THEN trim(p_details->>'po_number') ELSE purchase_order_number END,
   po_document_url=CASE WHEN method='purchase_order' THEN nullif(p_details->>'po_document_url','') ELSE po_document_url END WHERE id=p.id RETURNING * INTO p;
  IF p.sales_order_id IS NULL THEN RAISE EXCEPTION 'Approval did not create its sales order';END IF;
  outcome:=jsonb_build_object('status','approved','sales_order_id',p.sales_order_id,'deposit_invoice_id',p.deposit_invoice_id);
  INSERT INTO public.proposal_activity(organization_id,proposal_id,activity_type,viewer_user_id,portal_version_number,metadata) VALUES(p.organization_id,p.id,'accepted',auth.uid(),p.current_portal_version,jsonb_build_object('method',method,'request_id',p_request_id));
 ELSIF p_action='decline' THEN
  IF p_details->'promise_acknowledged' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Review Our Promise before declining';END IF;
  feedback:=private.apply_proposal_decline(p.id,p_details->>'reason',p_details->>'notes','customer_portal');
  outcome:=jsonb_build_object('status','declined','feedback_id',feedback);
 ELSE
  IF nullif(trim(p_details->>'message'),'') IS NULL OR length(p_details->>'message')>4000 THEN RAISE EXCEPTION 'Change request must contain 1 to 4000 characters';END IF;
  thread:=private.customer_proposal_thread(p.id);
  INSERT INTO public.messages(organization_id,thread_id,author_id,author_name,author_type,body,is_internal,is_read,portal_version_number) VALUES(p.organization_id,thread,c.id,coalesce(c.full_name,c.contact_name,'Customer'),'customer',trim(p_details->>'message'),false,false,p.current_portal_version);
  UPDATE public.proposals SET customer_change_requested_at=now(),customer_change_requested_version=p.current_portal_version WHERE id=p.id;
  INSERT INTO public.proposal_activity(organization_id,proposal_id,activity_type,viewer_user_id,portal_version_number,metadata) VALUES(p.organization_id,p.id,'decision_step',auth.uid(),p.current_portal_version,jsonb_build_object('step','change_request_submitted','thread_id',thread,'source','customer_portal'));
  outcome:=jsonb_build_object('status',p.status,'thread_id',thread);
 END IF;
 INSERT INTO private.proposal_customer_decisions(proposal_id,request_id,viewer_id,portal_version,action,details,result,evidence) VALUES(p.id,p_request_id,auth.uid(),p_expected_version,p_action,p_details,outcome,snapshot);
 RETURN outcome;
END $$;
REVOKE ALL ON FUNCTION public.submit_customer_proposal_decision(uuid,integer,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_customer_proposal_decision(uuid,integer,uuid,text,jsonb) TO authenticated;

CREATE FUNCTION public.get_customer_proposal_representative(p_proposal_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.get_proposal_display_template(p_proposal_id,NULL);
 SELECT jsonb_build_object('name',coalesce(u.full_name,'Your representative'),'email',u.email,'phone',u.phone) INTO result FROM public.proposals p JOIN public.contacts c ON c.id=p.contact_id AND c.organization_id=p.organization_id JOIN public.profiles u ON u.id=c.assigned_to AND u.organization_id=p.organization_id AND u.is_active AND u.role NOT IN ('portal_user','customer') WHERE p.id=p_proposal_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_customer_proposal_representative(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_proposal_representative(uuid) TO authenticated;

CREATE FUNCTION private.guard_customer_proposal_writes() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND NOT EXISTS(SELECT 1 FROM public.profiles u WHERE u.id=auth.uid() AND u.organization_id=OLD.organization_id AND u.is_active AND u.role NOT IN ('portal_user','customer')) THEN RAISE EXCEPTION 'Use the verified customer decision workflow' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_customer_proposal_writes() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_customer_proposal_writes BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION private.guard_customer_proposal_writes();
NOTIFY pgrst,'reload schema';

-- Retain deposit notifications using the actual notification schema and owner.
CREATE OR REPLACE FUNCTION public.notify_pending_deposit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' AND NEW.require_deposit IS TRUE AND NOT coalesce(NEW.deposit_paid,false) AND coalesce(NEW.accepted_via_method,'payment')<>'purchase_order' THEN
  INSERT INTO public.notifications(organization_id,user_id,type,title,body,related_id)
   SELECT NEW.organization_id,u.id,'proposal','Deposit Payment Needed','Customer approved proposal '||NEW.proposal_number||'; deposit due: $'||coalesce(NEW.deposit_amount_due,0)::text,NEW.id FROM public.contacts c JOIN public.profiles u ON u.id=c.assigned_to AND u.organization_id=NEW.organization_id AND u.is_active AND u.role NOT IN ('portal_user','customer') WHERE c.id=NEW.contact_id AND c.organization_id=NEW.organization_id;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.notify_deposit_completed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.deposit_paid IS TRUE AND NOT coalesce(OLD.deposit_paid,false) THEN
  INSERT INTO public.notifications(organization_id,user_id,type,title,body,related_id)
   SELECT NEW.organization_id,u.id,'proposal','Deposit Payment Received','Deposit received for proposal '||NEW.proposal_number,NEW.id FROM public.contacts c JOIN public.profiles u ON u.id=c.assigned_to AND u.organization_id=NEW.organization_id AND u.is_active AND u.role NOT IN ('portal_user','customer') WHERE c.id=NEW.contact_id AND c.organization_id=NEW.organization_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_pending_deposit() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.notify_deposit_completed() FROM PUBLIC,anon,authenticated;
