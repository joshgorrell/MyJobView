-- Print branding is independent of personal UI themes. Existing tenant RLS and
-- administrator update permissions continue to govern company settings.
ALTER TABLE public.company_settings ADD COLUMN print_accent_color text
  CHECK (print_accent_color IS NULL OR print_accent_color ~ '^#[0-9A-Fa-f]{6}$');
GRANT SELECT (print_accent_color) ON public.company_settings TO authenticated;

-- Internal helper only: return public dealer identity, never integration secrets.
-- Organization IDs come from already authorized agreement workflows.
CREATE FUNCTION private.security_document_branding(d jsonb, p_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_set(d,'{dealer}',
   jsonb_build_object('company_logo_url',s.company_logo_url,'website',s.website,
     'phone',o.phone,'address',nullif(concat_ws(', ',nullif(o.address_line1,''),nullif(o.address_line2,''),
       nullif(o.city,''),nullif(concat_ws(' ',nullif(o.state,''),nullif(o.zip,'')),'')),''),
     'print_accent_color',s.print_accent_color)
   || coalesce(nullif(d->'dealer','null'::jsonb),'{}'::jsonb))
 FROM (SELECT 1) seed
 LEFT JOIN public.company_settings s ON s.organization_id=p_org
 LEFT JOIN LATERAL (SELECT * FROM public.company_offices office
   WHERE office.organization_id=p_org AND office.is_active
   ORDER BY office.is_headquarters DESC NULLS LAST,office.display_order,office.id LIMIT 1) o ON true
 LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.security_document_branding(jsonb,uuid) FROM PUBLIC,anon,authenticated;

-- Add visual identity to draft/signed read representations without rewriting any
-- executed snapshot, prices, template text, signature, or accepted authorization.
DO $patch$
DECLARE body text; original text;
BEGIN
 original:=pg_get_functiondef('private.security_staff_document(uuid)'::regprocedure);
 body:=replace(original,'RETURN coalesce(c.onboarding_agreement_snapshot,d);',
   'RETURN private.security_document_branding(coalesce(c.onboarding_agreement_snapshot,d),c.organization_id);');
 IF body=original THEN RAISE EXCEPTION 'Staff document branding patch did not match'; END IF;
 EXECUTE body;

 original:=pg_get_functiondef('private.staff_security_onboarding(text,uuid,jsonb)'::regprocedure);
 body:=replace(original,'RETURN jsonb_build_object(''term_months'',',
   'RETURN private.security_document_branding(jsonb_build_object(''term_months'',');
 body:=replace(body,'FROM public.company_settings s WHERE s.organization_id=actor.organization_id LIMIT 1));',
   'FROM public.company_settings s WHERE s.organization_id=actor.organization_id LIMIT 1)),actor.organization_id);');
 IF body=original OR position('private.security_document_branding' in body)=0 THEN RAISE EXCEPTION 'Blank form branding patch did not match'; END IF;
 EXECUTE body;

 -- The portal core owns versioning and freezes the full draft on acceptance.
 original:=pg_get_functiondef('private.security_onboarding_core(text,uuid,text,jsonb)'::regprocedure);
 body:=replace(original,'v_version := md5(v_document::text);',
   'v_document := private.security_document_branding(v_document,v_contract.organization_id); v_version := md5(v_document::text);');
 body:=replace(body,'coalesce(v_contract.onboarding_agreement_snapshot,v_document)',
   'private.security_document_branding(coalesce(v_contract.onboarding_agreement_snapshot,v_document),v_contract.organization_id)');
 -- New authorizations identify the dealer. Previously accepted text is retained.
 body:=replace(body,'I authorize MyJobView to initiate','I authorize the provider identified in this agreement to initiate');
 IF body=original OR position('v_document := private.security_document_branding' in body)=0 THEN RAISE EXCEPTION 'Portal document branding patch did not match'; END IF;
 EXECUTE body;

 original:=pg_get_functiondef('private.security_autopay_authorization()'::regprocedure);
 body:=replace(original,'I authorize MyJobView to initiate','I authorize the provider identified in this agreement to initiate');
 IF body=original THEN RAISE EXCEPTION 'New authorization branding patch did not match'; END IF;
 EXECUTE body;
END $patch$;
