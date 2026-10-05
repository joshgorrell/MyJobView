-- Portal contracts expose included service names and the overall account price,
-- retaining the private accepted service allocation for staff/accounting.
DO $patch$
DECLARE body text;
BEGIN
 body:=pg_get_functiondef('private.portal_security_onboarding(text,uuid,text,jsonb)'::regprocedure);
 IF position(' RETURN r;' IN body)=0 THEN RAISE EXCEPTION 'Expected portal response was not found'; END IF;
 body:=replace(body,' RETURN r;', E' IF p_action=''get'' AND r->''document'' IS NOT NULL THEN\n  r:=jsonb_set(r,''{document,services}'',coalesce((SELECT jsonb_agg(jsonb_build_object(''name'',s->>''name'')) FROM jsonb_array_elements(coalesce(r->''document''->''services'',''[]''::jsonb)) s),''[]''::jsonb));\n END IF;\n RETURN r;');
 EXECUTE body;
END $patch$;
-- Hiding a UI column is insufficient: portal identities cannot retrieve the
-- detailed security allocation through direct REST or nested invoice relations.
CREATE POLICY security_invoice_allocation_staff_only ON public.invoice_line_items
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (NOT EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND i.security_billing_cycle_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=invoice_line_items.organization_id AND p.is_active AND p.role<>'portal'
 AND NOT coalesce((auth.jwt()->'app_metadata'->>'is_portal_user')::boolean,false)));
