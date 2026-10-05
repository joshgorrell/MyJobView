-- Admin-approved mailed invoices also need their itemized QB accounting record,
-- without entering any automatic payment state.
DO $patch$
DECLARE body text;
BEGIN
 body:=pg_get_functiondef('private.security_recurring_billing(text,uuid,jsonb)'::regprocedure);
 body:=replace(body,'OR (state=''paid'' AND accounting_synced_at IS NULL)','OR (state IN (''paid'',''mail'') AND accounting_synced_at IS NULL)');
 body:=replace(body,'  IF p_action=''accounting'' THEN',E'  IF p_action=''mail_accounting'' THEN\n    IF b.state<>''mail'' OR b.billing_mode<>''mail'' OR nullif(i.qbo_invoice_id,'''') IS NULL THEN RAISE EXCEPTION ''A synchronized mailed invoice is required''; END IF;\n    UPDATE public.security_billing_cycles SET accounting_synced_at=now(),lease_token=NULL,lease_until=NULL,last_message=NULL WHERE id=b.id;\n    RETURN jsonb_build_object(''success'',true);\n  END IF;\n  IF p_action=''accounting'' THEN');
 EXECUTE body;
END $patch$;
