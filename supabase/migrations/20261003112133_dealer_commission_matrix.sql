-- Opt-in, versioned dealer policies. Existing financial history is never migrated.
CREATE TABLE public.commission_matrix_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 rules jsonb NOT NULL, created_by uuid NOT NULL REFERENCES profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE company_commission_settings ADD COLUMN active_matrix_policy_id uuid REFERENCES commission_matrix_policies(id);
ALTER TABLE proposals ADD COLUMN commission_designer_id uuid REFERENCES profiles(id);
ALTER TABLE invoices ADD COLUMN commission_sale_type text CHECK(commission_sale_type IN ('proposal','service','retail'));
ALTER TABLE invoices ADD COLUMN commission_salesperson_id uuid REFERENCES profiles(id);
ALTER TABLE invoices ADD COLUMN commission_designer_id uuid REFERENCES profiles(id);
CREATE TABLE public.commission_sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN ('proposal','order','invoice')), source_id uuid NOT NULL, display_name text NOT NULL DEFAULT 'Sale',
 policy_id uuid NOT NULL REFERENCES commission_matrix_policies(id), sale_type text CHECK(sale_type IN ('proposal','service','retail')),
 sales_order_id uuid REFERENCES sales_orders(id), invoice_id uuid REFERENCES invoices(id), contact_id uuid REFERENCES contacts(id),
 salesperson_id uuid REFERENCES profiles(id), designer_id uuid REFERENCES profiles(id), pm_id uuid REFERENCES profiles(id),
 revenue numeric(14,2) NOT NULL DEFAULT 0, total numeric(14,2) NOT NULL DEFAULT 0,
 approved_cost numeric(14,2) CHECK(approved_cost>=0), cost_approved_by uuid REFERENCES profiles(id), cost_approved_at timestamptz,
 state text NOT NULL DEFAULT 'review' CHECK(state IN ('review','active','cost_review','cancelled')),
 snapshot jsonb, recognized_at timestamptz, recognized_date date, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,source_kind,source_id)
);
ALTER TABLE invoices ADD COLUMN commission_sale_id uuid REFERENCES commission_sales(id);
ALTER TABLE commission_records ADD COLUMN commission_sale_id uuid REFERENCES commission_sales(id);
CREATE UNIQUE INDEX commission_records_v3_recipient ON commission_records(commission_sale_id,role_type,COALESCE(employee_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE calculation_revision=3;
CREATE INDEX commission_sales_org ON commission_sales(organization_id,created_at);
CREATE INDEX invoices_commission_sale ON invoices(commission_sale_id) WHERE commission_sale_id IS NOT NULL;
CREATE TABLE public.commission_earning_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 commission_record_id uuid NOT NULL REFERENCES commission_records(id), source_key text NOT NULL,
 payment_id uuid, invoice_id uuid, earned_date date NOT NULL, amount numeric(14,2) NOT NULL,
 base_delta numeric(14,2) NOT NULL, commission_rate numeric(5,2) NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commission_events_period ON commission_earning_events(organization_id,earned_date);
CREATE INDEX commission_events_target ON commission_earning_events(commission_record_id,source_key);
CREATE TABLE commission_private.sale_basis_targets (
 sale_id uuid NOT NULL REFERENCES commission_sales(id), source_key text NOT NULL, target_base numeric(14,2) NOT NULL,
 PRIMARY KEY(sale_id,source_key)
);
ALTER TABLE commission_private.sale_basis_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON commission_private.sale_basis_targets FROM PUBLIC,anon,authenticated;
CREATE TABLE public.commission_sale_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 sale_id uuid NOT NULL REFERENCES commission_sales(id), reviewed_by uuid NOT NULL REFERENCES profiles(id),
 previous_snapshot jsonb, new_snapshot jsonb NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE commission_matrix_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_earning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_sale_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON commission_matrix_policies,commission_sales,commission_earning_events,commission_sale_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON commission_matrix_policies,commission_sales,commission_earning_events,commission_sale_reviews TO authenticated;
CREATE POLICY matrix_read ON commission_matrix_policies FOR SELECT TO authenticated USING(commission_private.is_member(organization_id));
CREATE POLICY sale_read ON commission_sales FOR SELECT TO authenticated USING(commission_private.can_manage(organization_id) OR
 (commission_private.is_member(organization_id) AND EXISTS(SELECT 1 FROM commission_records c WHERE c.commission_sale_id=commission_sales.id AND c.employee_id=(SELECT auth.uid()))));
CREATE POLICY event_read ON commission_earning_events FOR SELECT TO authenticated USING(commission_private.can_manage(organization_id) OR
 (commission_private.is_member(organization_id) AND EXISTS(SELECT 1 FROM commission_records c WHERE c.id=commission_record_id AND c.employee_id=(SELECT auth.uid()))));
CREATE POLICY review_read ON commission_sale_reviews FOR SELECT TO authenticated USING(commission_private.can_manage(organization_id));

CREATE FUNCTION commission_private.validate_matrix(p_rules jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE kind text; r jsonb; t jsonb; last_margin numeric; margin numeric; BEGIN
 IF jsonb_typeof(p_rules)<>'object' OR NOT(p_rules ?& ARRAY['proposal','service','retail']) OR (SELECT count(*) FROM jsonb_object_keys(p_rules))<>3 THEN RAISE EXCEPTION 'Provide proposal, service and retail matrix rows'; END IF;
 FOREACH kind IN ARRAY ARRAY['proposal','service','retail'] LOOP
  r:=p_rules->kind;
  IF COALESCE(r->>'method','') NOT IN ('gross','profit','sliding') OR COALESCE(r->>'timing','') NOT IN ('cash','sale')
   OR COALESCE(r->>'base','') NOT IN ('gross','profit') THEN RAISE EXCEPTION 'Invalid method, base or timing'; END IF;
  IF r->>'method'='sliding' THEN
   IF jsonb_typeof(r->'tiers')<>'array' OR jsonb_array_length(r->'tiers')<2 OR jsonb_array_length(r->'tiers')>21 THEN RAISE EXCEPTION 'Provide a below-minimum row and 1 to 20 tiers'; END IF;
   last_margin:=-1;
   FOR t IN SELECT value FROM jsonb_array_elements(r->'tiers') WITH ORDINALITY x(value,n) ORDER BY n LOOP
    IF last_margin=-1 THEN
     IF t->'min' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'First tier must be the below-minimum rate'; END IF;
     last_margin:=-0.5;
    ELSE
     margin:=(t->>'min')::numeric;
     IF margin IS NULL OR margin::text IN ('NaN','Infinity','-Infinity') OR margin<0 OR margin>100 OR margin<=last_margin THEN RAISE EXCEPTION 'Margin thresholds must be unique and increasing from 0 to 100'; END IF;
     last_margin:=margin;
    END IF;
    PERFORM commission_private.validate_shares(t,kind);
   END LOOP;
  ELSE PERFORM commission_private.validate_shares(r,kind); END IF;
 END LOOP;
END $$;
CREATE FUNCTION commission_private.validate_shares(r jsonb,kind text) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v numeric; k text; BEGIN
 FOREACH k IN ARRAY ARRAY['pool','design','pm','department'] LOOP
  v:=(r->>k)::numeric;
  IF v IS NULL OR v<0 OR v>100 OR v::text='NaN' OR v<>round(v,2) THEN RAISE EXCEPTION 'Each rate must be between 0 and 100'; END IF;
 END LOOP;
 IF (r->>'design')::numeric+(r->>'pm')::numeric+(r->>'department')::numeric>(r->>'pool')::numeric THEN RAISE EXCEPTION 'Role shares exceed the commission pool'; END IF;
 IF kind='retail' AND (r->>'design')::numeric<>0 THEN RAISE EXCEPTION 'Retail cannot have a designer share'; END IF;
 IF kind<>'service' AND (r->>'department')::numeric<>0 THEN RAISE EXCEPTION 'Department allocation is only for service'; END IF;
END $$;
CREATE FUNCTION public.save_commission_matrix(p_rules jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid; policy uuid; BEGIN
 SELECT organization_id INTO org FROM profiles WHERE id=auth.uid();
 IF NOT commission_private.can_manage(org) THEN RAISE EXCEPTION 'Commission management permission required' USING ERRCODE='42501'; END IF;
 -- Serialize policy activation; transactions cannot race the dealer's latest version.
 PERFORM 1 FROM company_commission_settings WHERE organization_id=org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company commission settings must exist'; END IF;
 PERFORM commission_private.validate_matrix(p_rules);
 INSERT INTO commission_matrix_policies(organization_id,rules,created_by) VALUES(org,p_rules,auth.uid()) RETURNING id INTO policy;
 UPDATE company_commission_settings SET active_matrix_policy_id=policy WHERE organization_id=org;
 RETURN policy;
END $$;
CREATE FUNCTION commission_private.guard_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.active_matrix_policy_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commission_matrix_policies WHERE id=NEW.active_matrix_policy_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Policy belongs to another dealer' USING ERRCODE='42501'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER commission_policy_owner BEFORE INSERT OR UPDATE ON company_commission_settings FOR EACH ROW EXECUTE FUNCTION commission_private.guard_policy();
CREATE FUNCTION public.set_commission_eligibility(p_employee uuid,p_eligible boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid; BEGIN
 SELECT organization_id INTO org FROM profiles WHERE id=p_employee;
 IF NOT commission_private.can_manage(org) OR p_eligible IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM profiles WHERE id=p_employee FOR UPDATE;
 UPDATE employee_commission_config SET eligible_for_commissions=p_eligible,updated_at=now() WHERE employee_id=p_employee AND organization_id=org;
 IF NOT FOUND THEN INSERT INTO employee_commission_config(employee_id,organization_id,eligible_for_commissions) VALUES(p_employee,org,p_eligible); END IF;
END $$;
CREATE FUNCTION commission_private.today(org uuid) RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM organizations WHERE id=org),'America/Chicago'))::date; $$;
CREATE FUNCTION commission_private.eligible(org uuid,person uuid,at_date date) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM profiles p JOIN employee_commission_config c ON c.employee_id=p.id AND c.organization_id=p.organization_id
 WHERE p.id=person AND p.organization_id=org AND p.is_active IS TRUE AND c.eligible_for_commissions IS TRUE
 AND (c.effective_from IS NULL OR c.effective_from<=at_date) AND (c.effective_to IS NULL OR c.effective_to>=at_date)); $$;

-- Select the rate with unrounded margin, then allocate one pool across roles.
CREATE FUNCTION commission_private.matrix_calculation(rule jsonb,revenue numeric,cost numeric) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE shares jsonb:=rule; margin numeric; base numeric; BEGIN
 IF (rule->>'method' IN ('profit','sliding')) AND cost IS NULL THEN RETURN jsonb_build_object('hold',true); END IF;
 margin:=CASE WHEN revenue>0 AND cost IS NOT NULL THEN (revenue-cost)/revenue*100 END;
 IF rule->>'method'='sliding' THEN
  SELECT value INTO shares FROM jsonb_array_elements(rule->'tiers') WHERE (value->>'min') IS NULL OR (value->>'min')::numeric<=margin
   ORDER BY (value->>'min')::numeric DESC NULLS LAST LIMIT 1;
 END IF;
 base:=GREATEST(0,CASE WHEN rule->>'method'='profit' OR (rule->>'method'='sliding' AND rule->>'base'='profit') THEN revenue-cost ELSE revenue END);
 RETURN jsonb_build_object('hold',false,'margin',margin,'base',base,'shares',shares,'timing',rule->>'timing');
END $$;

-- Allocate rounded cents inside the rounded pool. Independent role rounding
-- may otherwise exceed a very small pool by a cent.
CREATE FUNCTION commission_private.role_target(base numeric,pool numeric,design numeric,pm numeric,department numeric,rep_eligible boolean,role text,share numeric) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE budget numeric:=round(base*pool/100*share,2); d numeric; p numeric; dep numeric; BEGIN
 d:=LEAST(budget,round(base*design/100*share,2));
 p:=LEAST(budget-d,round(base*pm/100*share,2));
 dep:=LEAST(budget-d-p,round(base*department/100*share,2));
 RETURN CASE role WHEN 'design' THEN d WHEN 'pm' THEN p WHEN 'service_pm' THEN dep ELSE CASE WHEN rep_eligible THEN budget-d-p-dep ELSE 0 END END;
END $$;

-- Canonical proposal identity survives deposit -> order -> progress invoices.
CREATE FUNCTION commission_private.ensure_sale(kind text,source uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid; key_kind text:=kind; key_id uuid:=source; inv invoices%ROWTYPE; so sales_orders%ROWTYPE; prop proposals%ROWTYPE;
 policy uuid; policy_date timestamptz; sale uuid; type text; rep uuid; designer uuid; pm uuid; revenue numeric; total numeric; customer uuid; born timestamptz; label text;
BEGIN
 IF kind='invoice' THEN
  SELECT * INTO inv FROM invoices WHERE id=source;
  IF NOT FOUND THEN RETURN NULL; END IF;
  org:=inv.organization_id; born:=inv.created_at;
  -- Recurring monitoring receipts belong to the separate contract system
  -- unless the dealer explicitly classifies them for the sale matrix.
  IF inv.invoice_type='recurring' AND inv.tax_project_type='security_monitoring' AND inv.commission_sale_type IS NULL THEN RETURN NULL; END IF;
  -- Keep legacy/revision-2 receipts entirely in their existing calculation path.
  IF EXISTS(SELECT 1 FROM commission_records WHERE invoice_id=source AND calculation_revision<3) THEN RETURN NULL; END IF;
  SELECT * INTO so FROM sales_orders WHERE id=COALESCE(inv.sales_order_id,(SELECT sales_order_id FROM projects WHERE id=inv.project_id AND organization_id=org)) AND organization_id=org;
  IF inv.commission_sale_type='service' OR EXISTS(SELECT 1 FROM work_orders w WHERE w.id=inv.commission_work_order_id AND w.organization_id=org AND w.type='service') OR EXISTS(SELECT 1 FROM service_billing_queue WHERE invoice_id=source AND organization_id=org) THEN
   type:='service';
  ELSIF so.id IS NOT NULL OR inv.proposal_id IS NOT NULL THEN
   key_kind:='order';key_id:=so.id;
   IF COALESCE(so.proposal_id,inv.proposal_id) IS NOT NULL THEN key_kind:='proposal';key_id:=COALESCE(so.proposal_id,inv.proposal_id); END IF;
  END IF;
 ELSIF kind='order' THEN SELECT * INTO so FROM sales_orders WHERE id=source; org:=so.organization_id;born:=so.created_at;
  IF so.proposal_id IS NOT NULL THEN key_kind:='proposal';key_id:=so.proposal_id; END IF;
 ELSIF kind='proposal' THEN SELECT * INTO prop FROM proposals WHERE id=source;org:=prop.organization_id;born:=prop.created_at;
 ELSE RAISE EXCEPTION 'Invalid source kind'; END IF;
 IF org IS NULL OR key_id IS NULL THEN RETURN NULL; END IF;
 -- Lock this identity before creating/binding it, across all invoice writers.
 PERFORM pg_advisory_xact_lock(hashtextextended(org::text||key_kind||key_id::text,0));
 SELECT id INTO sale FROM commission_sales WHERE organization_id=org AND source_kind=key_kind AND source_id=key_id FOR UPDATE;
 IF sale IS NULL THEN
  SELECT active_matrix_policy_id INTO policy FROM company_commission_settings WHERE organization_id=org ORDER BY id LIMIT 1;
  SELECT created_at INTO policy_date FROM commission_matrix_policies WHERE id=policy AND organization_id=org;
  IF policy IS NULL THEN RETURN NULL; END IF;
  IF key_kind='proposal' THEN
   SELECT * INTO prop FROM proposals WHERE id=key_id AND organization_id=org;
   born:=prop.created_at; type:='proposal';rep:=COALESCE(so.sales_rep_id,prop.created_by);designer:=prop.commission_designer_id;
   revenue:=prop.subtotal;total:=prop.total;customer:=prop.contact_id;label:=prop.proposal_number;
  ELSIF key_kind='order' THEN type:='proposal';born:=so.created_at;rep:=so.sales_rep_id;customer:=so.contact_id;
   -- No proposal means no reliable pretax contract amount. Manager review supplies it.
   revenue:=0;total:=so.contract_total;label:=so.order_number;
  ELSE
   type:=COALESCE(type,inv.commission_sale_type);rep:=inv.commission_salesperson_id;designer:=inv.commission_designer_id;
   IF type='service' AND rep IS NULL THEN SELECT customer_sales_rep_id INTO rep FROM work_orders WHERE id=inv.commission_work_order_id AND organization_id=org; END IF;
   revenue:=inv.subtotal-COALESCE((SELECT sum(l.amount) FROM invoice_line_items l JOIN tax_classifications t ON t.id=l.tax_classification_id WHERE l.invoice_id=inv.id AND t.code='credit_card_fee'),0);
   total:=inv.total;customer:=inv.contact_id;label:=inv.invoice_number;
  END IF;
  -- Policy adoption is forward-only. Never silently switch an existing sale.
  -- A quote created under an earlier version keeps that version even when
  -- its first deposit/order is generated after a dealer settings change.
  SELECT m.id,m.created_at INTO policy,policy_date FROM commission_matrix_policies m
   WHERE m.organization_id=org AND m.created_at<=born AND m.created_at<=policy_date ORDER BY m.created_at DESC,m.id LIMIT 1;
  IF policy IS NULL THEN RETURN NULL; END IF;
  SELECT assigned_pm INTO pm FROM projects WHERE sales_order_id=so.id AND organization_id=org ORDER BY id LIMIT 1;
  INSERT INTO commission_sales(organization_id,source_kind,source_id,display_name,policy_id,sale_type,sales_order_id,invoice_id,contact_id,salesperson_id,designer_id,pm_id,revenue,total)
  VALUES(org,key_kind,key_id,COALESCE(label,'Sale'),policy,type,so.id,CASE WHEN key_kind='invoice' THEN inv.id END,customer,rep,designer,pm,GREATEST(0,COALESCE(revenue,0)),GREATEST(0,COALESCE(total,0))) RETURNING id INTO sale;
 END IF;
 IF so.id IS NOT NULL THEN UPDATE commission_sales SET sales_order_id=COALESCE(sales_order_id,so.id) WHERE id=sale; END IF;
 IF kind='invoice' AND inv.commission_sale_id IS DISTINCT FROM sale THEN
  UPDATE invoices SET commission_sale_id=sale WHERE id=inv.id;
  UPDATE commission_sales SET state='cancelled' WHERE id=inv.commission_sale_id AND source_kind='invoice' AND snapshot IS NULL;
 END IF;
 RETURN sale;
END $$;

-- Add only the delta required to reconcile an earning source. Sale lock ensures idempotency.
CREATE FUNCTION commission_private.earning_target(rec commission_records,target_key text,target numeric,target_base numeric,payment uuid,invoice uuid,at_date date,why text,correction boolean DEFAULT false,shared_base_delta numeric DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing numeric; existing_base numeric; had_events boolean; BEGIN
 SELECT COALESCE(sum(amount),0),COALESCE(sum(base_delta),0) INTO existing,existing_base FROM commission_earning_events WHERE commission_record_id=rec.id AND source_key=target_key;
 SELECT EXISTS(SELECT 1 FROM commission_earning_events WHERE commission_record_id=rec.id AND source_key=target_key) INTO had_events;
 IF target<>existing OR COALESCE(shared_base_delta,target_base-existing_base)<>0 THEN
  INSERT INTO commission_earning_events(organization_id,commission_record_id,source_key,payment_id,invoice_id,earned_date,amount,base_delta,commission_rate,reason)
  VALUES(rec.organization_id,rec.id,target_key,payment,invoice,CASE WHEN correction OR had_events THEN commission_private.today(rec.organization_id) ELSE at_date END,target-existing,COALESCE(shared_base_delta,target_base-existing_base),rec.commission_rate,
   CASE WHEN why='Cash collection or correction' THEN CASE WHEN correction OR had_events THEN 'Cash collection correction' ELSE 'Cash collection' END ELSE why END);
 END IF;
END $$;
CREATE FUNCTION commission_private.reclassify_receipt(rec commission_records,payment uuid,invoice uuid,at_date date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item record; BEGIN
 -- Correct a receipt's calendar classification without rewriting history or
 -- moving subsequently approved cost corrections away from their review date.
 FOR item IN SELECT earned_date,commission_rate,sum(amount) amount,sum(base_delta) base_delta FROM commission_earning_events
  WHERE commission_record_id=rec.id AND source_key=payment::text AND reason IN ('Cash collection','Receipt date reclassification') AND earned_date<>at_date
  GROUP BY earned_date,commission_rate HAVING sum(amount)<>0 OR sum(base_delta)<>0 LOOP
  INSERT INTO commission_earning_events(organization_id,commission_record_id,source_key,payment_id,invoice_id,earned_date,amount,base_delta,commission_rate,reason)
   VALUES(rec.organization_id,rec.id,payment::text,payment,invoice,item.earned_date,-item.amount,-item.base_delta,item.commission_rate,'Receipt date reclassification'),
   (rec.organization_id,rec.id,payment::text,payment,invoice,at_date,item.amount,item.base_delta,item.commission_rate,'Receipt date reclassification');
 END LOOP;
END $$;
CREATE FUNCTION commission_private.sync_sale(sale_id uuid,p_correction boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s commission_sales%ROWTYPE; rule jsonb; calc jsonb; shares jsonb; role record; rec commission_records%ROWTYPE;
 rep_rate numeric; design_rate numeric; pm_rate numeric; dep_rate numeric; base numeric; pool numeric; paid numeric; prev numeric; cur numeric; item record; alive text[]:=ARRAY[]::text[]; key text;
 old_bases jsonb; new_bases jsonb:='{}'::jsonb; target_base numeric;
BEGIN
 SELECT * INTO s FROM commission_sales WHERE id=sale_id FOR UPDATE;
 IF NOT FOUND OR s.state='review' OR s.snapshot IS NULL THEN RETURN; END IF;
 IF s.state='cost_review' THEN UPDATE commission_records SET approval_status='on_hold',hold_reason='Sale or costs changed; commission cost review required' WHERE commission_sale_id=s.id; RETURN; END IF;
 rule:=s.snapshot->'rule';calc:=commission_private.matrix_calculation(rule,s.revenue,s.approved_cost);
 IF (calc->>'hold')::boolean THEN RETURN; END IF;
 shares:=calc->'shares';base:=(calc->>'base')::numeric;pool:=(shares->>'pool')::numeric;
 design_rate:=CASE WHEN s.designer_id IS DISTINCT FROM s.salesperson_id AND (s.snapshot->>'designerEligible')::boolean THEN (shares->>'design')::numeric ELSE 0 END;
 pm_rate:=CASE WHEN (s.snapshot->>'pmEligible')::boolean THEN (shares->>'pm')::numeric ELSE 0 END;
 dep_rate:=(shares->>'department')::numeric;
 rep_rate:=CASE WHEN (s.snapshot->>'salesEligible')::boolean THEN pool-design_rate-pm_rate-dep_rate ELSE 0 END;
 SELECT COALESCE(jsonb_object_agg(b.source_key,b.target_base),'{}'::jsonb) INTO old_bases FROM commission_private.sale_basis_targets b WHERE b.sale_id=s.id;
 FOR role IN SELECT * FROM (VALUES
  (s.salesperson_id,CASE WHEN s.sale_type='service' THEN 'service_sales' ELSE 'sales_projects' END,'employee',rep_rate),
  (s.designer_id,'design','employee',design_rate),(s.pm_id,'pm','employee',pm_rate),
  (NULL::uuid,'service_pm','service_department',dep_rate)) x(employee,role_type,recipient_type,rate) LOOP
  IF role.rate<=0 OR (role.employee IS NULL AND role.recipient_type='employee') THEN CONTINUE; END IF;
  INSERT INTO commission_records(organization_id,employee_id,invoice_id,role_type,basis_type,commission_rate,calculation_revision,recipient_type,source_sales_order_id,commission_sale_id,attribution_locked)
  SELECT s.organization_id,role.employee,s.invoice_id,role.role_type,CASE WHEN rule->>'method'='profit' OR (rule->>'method'='sliding' AND rule->>'base'='profit') THEN 'profit' ELSE 'gross' END,role.rate,3,role.recipient_type,s.sales_order_id,s.id,true
  WHERE NOT EXISTS(SELECT 1 FROM commission_records WHERE commission_sale_id=s.id AND role_type=role.role_type AND employee_id IS NOT DISTINCT FROM role.employee);
 END LOOP;
 FOR rec IN SELECT * FROM commission_records WHERE commission_sale_id=s.id LOOP
  rec.commission_rate:=CASE rec.role_type WHEN 'design' THEN design_rate WHEN 'pm' THEN pm_rate WHEN 'service_pm' THEN dep_rate ELSE rep_rate END;
  alive:=ARRAY[]::text[];
  IF rule->>'timing'='sale' THEN
   target_base:=CASE WHEN s.state='cancelled' THEN 0 ELSE base END;
   new_bases:=jsonb_set(new_bases,ARRAY['sale'],to_jsonb(target_base));
   PERFORM commission_private.earning_target(rec,'sale',CASE WHEN s.state='cancelled' THEN 0 ELSE commission_private.role_target(base,pool,design_rate,pm_rate,dep_rate,(s.snapshot->>'salesEligible')::boolean,rec.role_type,1) END,target_base,NULL,s.invoice_id,s.recognized_date,'Sale recognition or approved correction',p_correction,target_base-COALESCE((old_bases->>'sale')::numeric,0));
   alive:=ARRAY['sale'];
  ELSE
   paid:=0;
   FOR item IN SELECT p.id,p.invoice_id,p.payment_date,p.amount-p.convenience_fee_amount AS principal FROM payments p JOIN invoices i ON i.id=p.invoice_id
    WHERE i.commission_sale_id=s.id AND i.organization_id=s.organization_id AND p.organization_id=s.organization_id AND i.status NOT IN ('draft','void','voided','cancelled') ORDER BY p.payment_date,p.created_at,p.id LOOP
    prev:=CASE WHEN s.total>0 THEN GREATEST(0,LEAST(paid/s.total,1)) ELSE 0 END;
    paid:=paid+item.principal;
    cur:=CASE WHEN s.total>0 THEN GREATEST(0,LEAST(paid/s.total,1)) ELSE 0 END;
    IF s.state='cancelled' THEN cur:=0;prev:=0; END IF;
    key:=item.id::text;alive:=array_append(alive,key);
    target_base:=round(base*cur,2)-round(base*prev,2);
    new_bases:=jsonb_set(new_bases,ARRAY[key],to_jsonb(target_base));
    PERFORM commission_private.reclassify_receipt(rec,item.id,item.invoice_id,item.payment_date);
    PERFORM commission_private.earning_target(rec,key,commission_private.role_target(base,pool,design_rate,pm_rate,dep_rate,(s.snapshot->>'salesEligible')::boolean,rec.role_type,cur)-commission_private.role_target(base,pool,design_rate,pm_rate,dep_rate,(s.snapshot->>'salesEligible')::boolean,rec.role_type,prev),target_base,item.id,item.invoice_id,item.payment_date,'Cash collection or correction',p_correction,target_base-COALESCE((old_bases->>key)::numeric,0));
   END LOOP;
  END IF;
  FOR key IN SELECT DISTINCT source_key FROM commission_earning_events WHERE commission_record_id=rec.id AND NOT(source_key=ANY(alive)) LOOP
   PERFORM commission_private.earning_target(rec,key,0,0,NULL,NULL,CURRENT_DATE,'Collection removed, moved or sale reversed',true,-COALESCE((old_bases->>key)::numeric,0));
  END LOOP;
  UPDATE commission_records SET basis_amount=base,commission_rate=rec.commission_rate,total_potential_commission=commission_private.role_target(base,pool,design_rate,pm_rate,dep_rate,(s.snapshot->>'salesEligible')::boolean,rec.role_type,1),
   source_sales_order_id=COALESCE(source_sales_order_id,s.sales_order_id),amount_collected=COALESCE(paid,0),amount_earned=(SELECT COALESCE(sum(amount),0) FROM commission_earning_events WHERE commission_record_id=rec.id),
   status=CASE WHEN (SELECT COALESCE(sum(amount),0) FROM commission_earning_events WHERE commission_record_id=rec.id)>amount_paid THEN 'ready_to_pay' WHEN amount_paid>0 THEN 'paid' ELSE 'pending' END,
   approval_status=CASE WHEN approval_status='on_hold' THEN 'pending_approval' ELSE approval_status END,hold_reason=NULL,updated_at=now() WHERE id=rec.id;
 END LOOP;
 DELETE FROM commission_private.sale_basis_targets b WHERE b.sale_id=s.id AND NOT(new_bases ? b.source_key);
 INSERT INTO commission_private.sale_basis_targets(sale_id,source_key,target_base)
 SELECT s.id,k,v::numeric FROM jsonb_each_text(new_bases) x(k,v)
 ON CONFLICT ON CONSTRAINT sale_basis_targets_pkey DO UPDATE SET target_base=EXCLUDED.target_base;
END $$;

CREATE FUNCTION public.get_commission_sale_context(p_kind text,p_source uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid; sale uuid; result jsonb; policy jsonb; people jsonb; calc jsonb; BEGIN
 SELECT organization_id INTO org FROM profiles WHERE id=auth.uid();
 IF NOT commission_private.can_manage(org) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT ((p_kind='invoice' AND EXISTS(SELECT 1 FROM invoices WHERE id=p_source AND organization_id=org)) OR
 (p_kind='proposal' AND EXISTS(SELECT 1 FROM proposals WHERE id=p_source AND organization_id=org)) OR
 (p_kind='order' AND EXISTS(SELECT 1 FROM sales_orders WHERE id=p_source AND organization_id=org))) THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501'; END IF;
 SELECT m.rules INTO policy FROM company_commission_settings c JOIN commission_matrix_policies m ON m.id=c.active_matrix_policy_id WHERE c.organization_id=org LIMIT 1;
 IF policy IS NULL THEN RETURN jsonb_build_object('enabled',false); END IF;
 sale:=commission_private.ensure_sale(p_kind,p_source);
 SELECT to_jsonb(s) INTO result FROM commission_sales s WHERE id=sale;
 SELECT commission_private.matrix_calculation(COALESCE(s.snapshot->'rule',m.rules->s.sale_type),s.revenue,s.approved_cost) INTO calc FROM commission_sales s JOIN commission_matrix_policies m ON m.id=s.policy_id WHERE s.id=sale AND s.sale_type IS NOT NULL;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'eligible',commission_private.eligible(org,p.id,commission_private.today(org))) ORDER BY p.full_name),'[]'::jsonb) INTO people FROM profiles p WHERE p.organization_id=org AND p.is_active IS TRUE;
 RETURN jsonb_build_object('enabled',true,'sale',result,'rules',policy,'people',people,'calculation',calc);
END $$;

CREATE FUNCTION public.review_commission_sale(p_kind text,p_source uuid,p_type text,p_rep uuid,p_designer uuid,p_pm uuid,p_cost numeric,p_revenue numeric,p_total numeric,p_finalize boolean,p_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid; sale uuid; s commission_sales%ROWTYPE; rule jsonb; snap jsonb; person uuid; finalized boolean:=false; recognized date; tz text; BEGIN
 SELECT organization_id INTO org FROM profiles WHERE id=auth.uid();
 IF NOT commission_private.can_manage(org) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF (p_kind='invoice' AND NOT EXISTS(SELECT 1 FROM invoices WHERE id=p_source AND organization_id=org)) OR
 (p_kind='order' AND NOT EXISTS(SELECT 1 FROM sales_orders WHERE id=p_source AND organization_id=org)) OR
 (p_kind='proposal' AND NOT EXISTS(SELECT 1 FROM proposals WHERE id=p_source AND organization_id=org)) OR p_kind NOT IN ('invoice','order','proposal') THEN RAISE EXCEPTION 'Invalid source' USING ERRCODE='42501'; END IF;
 FOREACH person IN ARRAY ARRAY[p_rep,p_designer,p_pm] LOOP
  IF person IS NOT NULL AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=person AND organization_id=org) THEN RAISE EXCEPTION 'Recipient belongs to another dealer' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF p_kind='proposal' THEN UPDATE proposals SET commission_designer_id=p_designer WHERE id=p_source; END IF;
 IF p_kind='invoice' THEN UPDATE invoices SET commission_sale_type=p_type,commission_salesperson_id=p_rep,commission_designer_id=p_designer WHERE id=p_source; END IF;
 sale:=commission_private.ensure_sale(p_kind,p_source);
 IF sale IS NULL THEN RAISE EXCEPTION 'Source predates matrix activation, has legacy commissions, or matrix is not enabled'; END IF;
 SELECT * INTO s FROM commission_sales WHERE id=sale FOR UPDATE;
 IF p_type IS NULL OR p_type NOT IN ('proposal','service','retail') OR (p_type='retail' AND p_designer IS NOT NULL) THEN RAISE EXCEPTION 'Invalid sale type/designer'; END IF;
 IF s.source_kind<>'invoice' AND p_type<>'proposal' THEN RAISE EXCEPTION 'Proposal/order sales require proposal sale type'; END IF;
 IF s.snapshot IS NOT NULL AND (s.salesperson_id IS DISTINCT FROM p_rep OR s.designer_id IS DISTINCT FROM p_designer OR s.pm_id IS DISTINCT FROM p_pm OR s.sale_type IS DISTINCT FROM p_type) THEN RAISE EXCEPTION 'Recognized attribution is locked'; END IF;
 IF s.snapshot IS NOT NULL AND p_finalize IS NOT TRUE THEN RAISE EXCEPTION 'An existing entitlement requires an approved correction'; END IF;
 IF p_finalize IS NULL OR p_revenue IS NULL OR p_total IS NULL OR p_revenue::text IN ('NaN','Infinity','-Infinity') OR p_total::text IN ('NaN','Infinity','-Infinity') OR p_cost::text IN ('NaN','Infinity','-Infinity') OR p_revenue<0 OR p_total<p_revenue OR (p_cost IS NOT NULL AND p_cost<0) OR p_revenue<>round(p_revenue,2) OR p_total<>round(p_total,2) OR p_cost<>round(p_cost,2) THEN RAISE EXCEPTION 'Invalid revenue, invoice total or direct costs'; END IF;
 IF s.source_kind='invoice' AND (p_revenue IS DISTINCT FROM s.revenue OR p_total IS DISTINCT FROM s.total) THEN RAISE EXCEPTION 'Invoice amounts must match the current invoice'; END IF;
 SELECT rules->p_type INTO rule FROM commission_matrix_policies WHERE id=s.policy_id;
 IF p_finalize THEN
  IF length(trim(COALESCE(p_reason,'')))<5 THEN RAISE EXCEPTION 'Provide a cost/revenue review note'; END IF;
  IF rule->>'method' IN ('profit','sliding') AND p_cost IS NULL THEN RAISE EXCEPTION 'Approve complete direct costs first'; END IF;
  IF s.source_kind='invoice' THEN SELECT status NOT IN ('draft','void','voided','cancelled') INTO finalized FROM invoices WHERE id=s.source_id;
  ELSIF s.source_kind='order' THEN finalized:=true;
  ELSE finalized:=EXISTS(SELECT 1 FROM proposals WHERE id=s.source_id AND status IN ('approved','approved_pending_action')) OR s.sales_order_id IS NOT NULL; END IF;
  IF NOT finalized THEN RAISE EXCEPTION 'Sale is not finalized; save attribution for now'; END IF;
  SELECT COALESCE(timezone,'America/Chicago') INTO tz FROM organizations WHERE id=org;
  tz:=COALESCE(tz,'America/Chicago');
  IF s.source_kind='invoice' THEN SELECT invoice_date INTO recognized FROM invoices WHERE id=s.source_id;
  ELSIF s.sales_order_id IS NOT NULL THEN SELECT (COALESCE(booked_at,created_at) AT TIME ZONE tz)::date INTO recognized FROM sales_orders WHERE id=s.sales_order_id;
  ELSE SELECT (COALESCE(approved_at,created_at) AT TIME ZONE tz)::date INTO recognized FROM proposals WHERE id=s.source_id; END IF;
 END IF;
 snap:=COALESCE(s.snapshot,jsonb_build_object('rule',rule,'salesEligible',commission_private.eligible(org,p_rep,COALESCE(recognized,commission_private.today(org))),'designerEligible',commission_private.eligible(org,p_designer,COALESCE(recognized,commission_private.today(org))),'pmEligible',commission_private.eligible(org,p_pm,COALESCE(recognized,commission_private.today(org)))));
 UPDATE commission_sales SET sale_type=p_type,salesperson_id=p_rep,designer_id=p_designer,pm_id=p_pm,revenue=p_revenue,total=p_total,approved_cost=p_cost,
  cost_approved_by=CASE WHEN p_finalize THEN auth.uid() ELSE cost_approved_by END,cost_approved_at=CASE WHEN p_finalize THEN now() ELSE cost_approved_at END,
  snapshot=CASE WHEN p_finalize THEN snap ELSE snapshot END,state=CASE WHEN p_finalize THEN 'active' ELSE state END,recognized_at=CASE WHEN p_finalize THEN COALESCE(recognized_at,now()) ELSE recognized_at END,recognized_date=CASE WHEN p_finalize THEN COALESCE(recognized_date,recognized) ELSE recognized_date END WHERE id=sale;
 INSERT INTO commission_sale_reviews(organization_id,sale_id,reviewed_by,previous_snapshot,new_snapshot,reason)
 VALUES(org,sale,auth.uid(),to_jsonb(s),jsonb_build_object('policy',snap,'revenue',p_revenue,'total',p_total,'cost',p_cost,'finalized',p_finalize,'salesperson',p_rep,'designer',p_designer,'pm',p_pm),COALESCE(NULLIF(trim(p_reason),''),'Attribution saved'));
 PERFORM commission_private.sync_sale(sale,s.snapshot IS NOT NULL);
 RETURN sale;
END $$;

-- Matrix invoices bypass the legacy calculator; old invoices remain unchanged.
ALTER FUNCTION commission_private.sync_invoice(uuid) RENAME TO sync_invoice_v2;
CREATE FUNCTION commission_private.sync_invoice(p_invoice uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sale uuid; net numeric; invoice_total numeric; BEGIN
 SELECT commission_sale_id INTO sale FROM invoices WHERE id=p_invoice;
 IF sale IS NULL OR EXISTS(SELECT 1 FROM commission_sales WHERE id=sale AND snapshot IS NULL) THEN
  sale:=COALESCE(commission_private.ensure_sale('invoice',p_invoice),sale);
 END IF;
 IF sale IS NOT NULL THEN
  SELECT GREATEST(0,i.subtotal-COALESCE((SELECT sum(l.amount) FROM invoice_line_items l JOIN tax_classifications t ON t.id=l.tax_classification_id WHERE l.invoice_id=i.id AND t.code='credit_card_fee'),0)),i.total INTO net,invoice_total FROM invoices i WHERE i.id=p_invoice;
  UPDATE commission_sales SET revenue=net,total=invoice_total,state=CASE WHEN snapshot IS NULL THEN 'review' ELSE 'cost_review' END
   WHERE id=sale AND source_kind='invoice' AND (revenue IS DISTINCT FROM net OR total IS DISTINCT FROM invoice_total);
  PERFORM commission_private.sync_sale(sale);
 ELSE PERFORM commission_private.sync_invoice_v2(p_invoice); END IF;
END $$;
CREATE FUNCTION commission_private.matrix_source_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sale uuid; target uuid; BEGIN
 IF TG_TABLE_NAME='sales_orders' THEN
  sale:=commission_private.ensure_sale('order',NEW.id);
 ELSIF TG_TABLE_NAME='proposals' THEN SELECT id INTO sale FROM commission_sales WHERE source_kind='proposal' AND source_id=NEW.id;
 ELSIF TG_TABLE_NAME='invoices' THEN sale:=NEW.commission_sale_id; END IF;
 IF sale IS NOT NULL THEN
  IF TG_OP='UPDATE' AND ((TG_TABLE_NAME='proposals' AND (to_jsonb(OLD)->'subtotal' IS DISTINCT FROM to_jsonb(NEW)->'subtotal' OR to_jsonb(OLD)->'total' IS DISTINCT FROM to_jsonb(NEW)->'total'))
   OR (TG_TABLE_NAME='sales_orders' AND to_jsonb(OLD)->'contract_total' IS DISTINCT FROM to_jsonb(NEW)->'contract_total')) THEN
   UPDATE commission_sales SET state=CASE WHEN snapshot IS NULL THEN 'review' ELSE 'cost_review' END WHERE id=sale;
  END IF;
  IF TG_TABLE_NAME='proposals' AND to_jsonb(NEW)->>'status' IN ('cancelled','declined') THEN UPDATE commission_sales SET state='cancelled' WHERE id=sale; END IF;
  PERFORM commission_private.sync_sale(sale);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER matrix_order_source AFTER INSERT OR UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION commission_private.matrix_source_change();
CREATE TRIGGER matrix_proposal_source AFTER UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION commission_private.matrix_source_change();
CREATE FUNCTION commission_private.matrix_change_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb; source_order uuid; sale uuid; org uuid; BEGIN
 IF TG_OP='DELETE' THEN row_data:=to_jsonb(OLD); ELSE row_data:=to_jsonb(NEW); END IF;
 org:=(row_data->>'organization_id')::uuid;
 source_order:=COALESCE((row_data->>'sales_order_id')::uuid,(SELECT sales_order_id FROM projects WHERE id=(row_data->>'project_id')::uuid AND organization_id=org));
 IF source_order IS NOT NULL AND (row_data->>'status'='approved' OR (TG_OP='UPDATE' AND to_jsonb(OLD)->>'status'='approved')) THEN
  SELECT s.id INTO sale FROM commission_sales s LEFT JOIN sales_orders so ON so.id=source_order AND so.organization_id=org
   WHERE s.organization_id=org AND (s.sales_order_id=source_order OR (s.source_kind='proposal' AND s.source_id=so.proposal_id)) FOR UPDATE OF s;
  IF sale IS NOT NULL THEN UPDATE commission_sales SET state=CASE WHEN snapshot IS NULL THEN 'review' ELSE 'cost_review' END WHERE id=sale; PERFORM commission_private.sync_sale(sale); END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER matrix_change_order_review AFTER INSERT OR UPDATE OR DELETE ON change_orders FOR EACH ROW EXECUTE FUNCTION commission_private.matrix_change_order();

-- Move/delete receipts reconcile both source entitlements, including a deleted invoice.
CREATE FUNCTION commission_private.matrix_payment_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sale uuid; BEGIN
 SELECT commission_sale_id INTO sale FROM invoices WHERE id=OLD.invoice_id;
 IF sale IS NOT NULL THEN PERFORM commission_private.sync_sale(sale); END IF;
 RETURN OLD; END $$;
CREATE TRIGGER matrix_deleted_payment AFTER DELETE ON payments FOR EACH ROW EXECUTE FUNCTION commission_private.matrix_payment_delete();
CREATE FUNCTION commission_private.matrix_invoice_amounts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE net numeric; BEGIN
 IF NEW.commission_sale_id IS NOT NULL THEN
  net:=GREATEST(0,NEW.subtotal-COALESCE((SELECT sum(l.amount) FROM invoice_line_items l JOIN tax_classifications t ON t.id=l.tax_classification_id WHERE l.invoice_id=NEW.id AND t.code='credit_card_fee'),0));
  UPDATE commission_sales SET revenue=net,total=NEW.total,
   state=CASE WHEN snapshot IS NULL THEN 'review' WHEN NEW.status IN ('void','voided','cancelled') THEN 'cancelled' WHEN revenue IS DISTINCT FROM net OR total IS DISTINCT FROM NEW.total THEN 'cost_review' ELSE state END
  WHERE id=NEW.commission_sale_id AND source_kind='invoice';
  PERFORM commission_private.sync_sale(NEW.commission_sale_id);
 END IF;RETURN NEW;END $$;
CREATE TRIGGER matrix_invoice_amounts AFTER UPDATE OF subtotal,total,status ON invoices FOR EACH ROW EXECUTE FUNCTION commission_private.matrix_invoice_amounts();

CREATE FUNCTION commission_private.guard_matrix_invoice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE s commission_sales%ROWTYPE; person uuid; BEGIN
 FOREACH person IN ARRAY ARRAY[NEW.commission_salesperson_id,NEW.commission_designer_id] LOOP
  IF person IS NOT NULL AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=person AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Commission recipient belongs to another dealer' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF NEW.commission_sale_id IS NOT NULL THEN
  SELECT * INTO s FROM commission_sales WHERE id=NEW.commission_sale_id;
  IF NOT FOUND OR s.organization_id IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Invalid dealer commission sale' USING ERRCODE='42501'; END IF;
  IF NOT ((s.source_kind='invoice' AND s.source_id=NEW.id) OR
   (s.source_kind='proposal' AND (s.source_id=NEW.proposal_id OR EXISTS(SELECT 1 FROM sales_orders so WHERE so.id=COALESCE(NEW.sales_order_id,(SELECT sales_order_id FROM projects WHERE id=NEW.project_id AND organization_id=NEW.organization_id)) AND so.proposal_id=s.source_id AND so.organization_id=NEW.organization_id))) OR
   (s.source_kind='order' AND s.source_id=COALESCE(NEW.sales_order_id,(SELECT sales_order_id FROM projects WHERE id=NEW.project_id AND organization_id=NEW.organization_id)))) THEN RAISE EXCEPTION 'Invoice does not belong to this commission sale'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.commission_sale_id IS NOT NULL AND NEW.commission_sale_id IS DISTINCT FROM OLD.commission_sale_id
  AND EXISTS(SELECT 1 FROM commission_sales WHERE id=OLD.commission_sale_id AND snapshot IS NOT NULL) THEN RAISE EXCEPTION 'Commission source identity is locked'; END IF;
 IF s.snapshot IS NOT NULL AND s.source_kind='invoice' AND s.sale_type<>'service' AND
  (NEW.proposal_id IS NOT NULL OR NEW.sales_order_id IS NOT NULL) THEN RAISE EXCEPTION 'Recognized standalone sale cannot be attached to another sale'; END IF;
 RETURN NEW;END $$;
CREATE TRIGGER matrix_invoice_owner BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION commission_private.guard_matrix_invoice();
CREATE TRIGGER matrix_invoice_identity AFTER UPDATE OF proposal_id,sales_order_id,project_id,commission_sale_type,commission_work_order_id ON invoices FOR EACH ROW EXECUTE FUNCTION public.update_commission_on_payment();
-- A subsequently merged security-billing migration installed an independent
-- invoice ratio calculator. Route every invoice through the shared engine.
DROP TRIGGER IF EXISTS trigger_update_commission_on_invoice_update ON invoices;
CREATE TRIGGER trigger_update_commission_on_invoice_update AFTER UPDATE ON invoices FOR EACH ROW
 WHEN(OLD.amount_paid IS DISTINCT FROM NEW.amount_paid OR OLD.total IS DISTINCT FROM NEW.total
 OR OLD.subtotal IS DISTINCT FROM NEW.subtotal OR OLD.status IS DISTINCT FROM NEW.status
 OR OLD.project_id IS DISTINCT FROM NEW.project_id OR OLD.sales_order_id IS DISTINCT FROM NEW.sales_order_id
 OR OLD.proposal_id IS DISTINCT FROM NEW.proposal_id OR OLD.commission_work_order_id IS DISTINCT FROM NEW.commission_work_order_id)
 EXECUTE FUNCTION public.update_commission_on_payment();
CREATE FUNCTION commission_private.guard_matrix_invoice_line() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM invoices i WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Invoice line belongs to another dealer' USING ERRCODE='42501'; END IF;
 RETURN NEW;END $$;
CREATE TRIGGER matrix_invoice_line_owner BEFORE INSERT OR UPDATE ON invoice_line_items FOR EACH ROW EXECUTE FUNCTION commission_private.guard_matrix_invoice_line();

ALTER FUNCTION public.get_commission_period_report(date,date) RENAME TO get_commission_period_report_v2;
REVOKE ALL ON FUNCTION public.get_commission_period_report_v2(date,date) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_commission_period_report(p_start date,p_end date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE org uuid; old jsonb; rows jsonb; BEGIN
 old:=public.get_commission_period_report_v2(p_start,p_end);
 SELECT organization_id INTO org FROM profiles WHERE id=auth.uid();
 SELECT COALESCE(jsonb_agg(jsonb_build_object('commissionRecordId',c.id,'earningEventId',e.id,'collectionId',e.source_key||':'||e.created_at::text||':'||e.earned_date::text,'invoiceId',COALESCE(e.invoice_id,s.invoice_id,s.id),
  'invoiceNumber',COALESCE(i.invoice_number,so.order_number,p.proposal_number,'Sale'),'customerName',COALESCE(ct.full_name,ct.contact_name,'Customer'),
  'paymentDate',e.earned_date,'paymentMethod',CASE WHEN e.source_key='sale' THEN 'Time of sale' ELSE 'Cash / correction' END,
  'employeeId',COALESCE(c.employee_id::text,'service_department'),'employeeName',CASE WHEN c.recipient_type='service_department' THEN 'Service Department' ELSE ep.full_name END,
  'roleType',c.role_type,'effectiveRate',e.commission_rate,'grossSale',e.base_delta,'ccFeeDeducted',0,'netCommissionable',e.base_delta,
  'commissionAmount',e.amount,'approvalStatus',c.approval_status,'calculationMethod',s.snapshot->'rule'->>'method','earningTiming',s.snapshot->'rule'->>'timing'
 ) ORDER BY e.earned_date,e.created_at,e.id),'[]'::jsonb) INTO rows
 FROM commission_earning_events e JOIN commission_records c ON c.id=e.commission_record_id JOIN commission_sales s ON s.id=c.commission_sale_id
 LEFT JOIN invoices i ON i.id=e.invoice_id LEFT JOIN sales_orders so ON so.id=s.sales_order_id LEFT JOIN proposals p ON s.source_kind='proposal' AND p.id=s.source_id
 LEFT JOIN contacts ct ON ct.id=s.contact_id AND ct.organization_id=org LEFT JOIN profiles ep ON ep.id=c.employee_id AND ep.organization_id=org
 WHERE e.organization_id=org AND e.earned_date BETWEEN p_start AND p_end AND (commission_private.can_manage(org) OR c.employee_id=auth.uid());
 RETURN jsonb_set(old,'{lines}',(old->'lines')||rows);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA commission_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION commission_private.can_manage(uuid),commission_private.is_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.save_commission_matrix(jsonb),public.set_commission_eligibility(uuid,boolean),public.review_commission_sale(text,uuid,text,uuid,uuid,uuid,numeric,numeric,numeric,boolean,text),public.get_commission_period_report(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_commission_matrix(jsonb),public.set_commission_eligibility(uuid,boolean),public.review_commission_sale(text,uuid,text,uuid,uuid,uuid,numeric,numeric,numeric,boolean,text),public.get_commission_period_report(date,date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_commission_sale_context(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_commission_sale_context(text,uuid) TO authenticated;
