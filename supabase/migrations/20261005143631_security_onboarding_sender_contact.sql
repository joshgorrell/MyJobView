-- Add a deliberately small staff contact to an already-authorized portal response.
-- Keep it outside the agreement document so it does not change signed terms/version.
DO $patch$
DECLARE body text;
BEGIN
 body:=pg_get_functiondef('private.portal_security_onboarding(text,uuid,text,jsonb)'::regprocedure);
 IF position(' RETURN r;' IN body)=0 THEN RAISE EXCEPTION 'Expected portal response was not found'; END IF;
 body:=replace(body,' RETURN r;', $contact$
 IF p_action='get' THEN
  r:=r || jsonb_build_object('support_contact',(
   SELECT CASE WHEN coalesce(nullif(btrim(p.email),''),nullif(btrim(cs.company_email),'')) IS NOT NULL
    THEN jsonb_build_object('name',CASE WHEN nullif(btrim(p.email),'') IS NOT NULL THEN coalesce(nullif(btrim(p.full_name),''),cs.company_name,'Your provider') ELSE coalesce(cs.company_name,'Your provider') END,
      'email',coalesce(nullif(btrim(p.email),''),nullif(btrim(cs.company_email),''))) ELSE NULL END
   FROM public.security_contracts c
   LEFT JOIN public.profiles p ON p.id=c.invitation_sent_by_user_id AND p.organization_id=c.organization_id AND p.is_active AND p.role<>'portal'
   LEFT JOIN public.company_settings cs ON cs.organization_id=c.organization_id
   WHERE c.id=(r->>'id')::uuid LIMIT 1
  ));
 END IF;
 RETURN r;
$contact$);
 EXECUTE body;
END $patch$;
