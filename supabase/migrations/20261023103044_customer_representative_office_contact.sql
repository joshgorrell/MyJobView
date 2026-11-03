CREATE OR REPLACE FUNCTION public.get_customer_proposal_representative(p_proposal_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.get_proposal_display_template(p_proposal_id,NULL);
 SELECT jsonb_build_object('name',coalesce(u.full_name,'Your representative'),'email',u.email,'phone',o.phone,'phone_kind','office') INTO result
 FROM public.proposals p JOIN public.contacts c ON c.id=p.contact_id AND c.organization_id=p.organization_id
 JOIN public.profiles u ON u.id=c.assigned_to AND u.organization_id=p.organization_id AND u.is_active AND u.role NOT IN ('portal_user','customer')
 LEFT JOIN public.company_offices o ON o.id=c.office_id AND o.organization_id=p.organization_id
 WHERE p.id=p_proposal_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_customer_proposal_representative(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_proposal_representative(uuid) TO authenticated;
