CREATE OR REPLACE FUNCTION private.verified_proposal_customer(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.proposals p
  JOIN public.contacts c ON c.id=p.contact_id AND c.organization_id=p.organization_id
  LEFT JOIN public.profiles u ON u.id=auth.uid()
  WHERE p.id=p_id AND p.is_portal_visible AND c.portal_user_id=auth.uid()
   AND (u.id IS NULL OR (u.organization_id=p.organization_id AND u.is_active IS TRUE AND u.role IN ('portal_user','customer')))
 );
$$;
REVOKE ALL ON FUNCTION private.verified_proposal_customer(uuid) FROM PUBLIC,anon,authenticated;
