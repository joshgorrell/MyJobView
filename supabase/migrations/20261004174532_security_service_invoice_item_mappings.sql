-- Accepted service identity follows the agreement into each invoice line.
-- No FK: deleting a catalog entry must not delete historical invoice evidence.
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS security_service_id uuid;
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS security_service_name text;
DO $patch$
DECLARE body text; sig text;
BEGIN
 FOREACH sig IN ARRAY ARRAY['private.security_staff_document(uuid)','private.staff_security_onboarding(text,uuid,jsonb)','private.security_onboarding_core(text,uuid,text,jsonb)','private.security_correct_onboarding(uuid,integer,jsonb,text)'] LOOP
  body:=pg_get_functiondef(sig::regprocedure);
  body:=replace(body,'jsonb_build_object(''name'',m.name,''monthly_price'',cs.monthly_price)','jsonb_build_object(''service_id'',m.id,''name'',m.name,''monthly_price'',cs.monthly_price)');
  body:=replace(body,'jsonb_build_object(''name'',svc.name,''monthly_price'',svc.monthly_price)','jsonb_build_object(''service_id'',svc.id,''name'',svc.name,''monthly_price'',svc.monthly_price)');
  body:=replace(body,'jsonb_build_object(''name'',ms.name,''monthly_price'',s.monthly_price)','jsonb_build_object(''service_id'',ms.id,''name'',ms.name,''monthly_price'',s.monthly_price)');
  body:=replace(body,'jsonb_build_object(''name'',name,''monthly_price'',monthly_price)','jsonb_build_object(''service_id'',id,''name'',name,''monthly_price'',monthly_price)');
  EXECUTE body;
 END LOOP;
 body:=pg_get_functiondef('private.security_recurring_billing(text,uuid,jsonb)'::regprocedure);
 body:=replace(body,'sort_order,item_type,is_taxable,tax_classification_id)','sort_order,item_type,is_taxable,tax_classification_id,security_service_id,security_service_name)');
 body:=replace(body,'1,v_amount,v_amount,v_line,''labor'',true,c.monitoring_tax_classification_id);','1,v_amount,v_amount,v_line,''labor'',true,c.monitoring_tax_classification_id,nullif(v_service.value->>''service_id'','''')::uuid,coalesce(nullif(btrim(v_service.value->>''name''),''''),''Security monitoring''));');
 body:=replace(body,'v_months,7,v_fee,v_service_count+1,''labor'',true,c.monitoring_tax_classification_id);','v_months,7,v_fee,v_service_count+1,''labor'',true,c.monitoring_tax_classification_id,NULL,''Mailed invoice fee'');');
 EXECUTE body;
END $patch$;
