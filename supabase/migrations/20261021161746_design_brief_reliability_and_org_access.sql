-- Sessions and their aggregate notes commit together. All functions retain RLS.
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='design_briefs'
  LOOP EXECUTE format('DROP POLICY %I ON public.design_briefs',pol.policyname); END LOOP;
END $$;
ALTER TABLE public.design_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY brief_read ON public.design_briefs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
    AND p.organization_id=design_briefs.organization_id AND p.is_active IS DISTINCT FROM false
    AND (design_briefs.created_by=p.id OR p.role IN ('admin','manager','service_manager'))));
CREATE POLICY brief_insert ON public.design_briefs FOR INSERT TO authenticated WITH CHECK (
  created_by=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id=(SELECT auth.uid()) AND p.organization_id=design_briefs.organization_id AND p.is_active IS DISTINCT FROM false));
CREATE POLICY brief_update ON public.design_briefs FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
    AND p.organization_id=design_briefs.organization_id AND p.is_active IS DISTINCT FROM false
    AND (p.role IN ('admin','manager','service_manager') OR
      (created_by=p.id AND linked_proposal_id IS NULL AND status<>'archived'))))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
    AND p.organization_id=design_briefs.organization_id AND p.is_active IS DISTINCT FROM false
    AND (p.role IN ('admin','manager','service_manager') OR
      (created_by=p.id AND linked_proposal_id IS NULL AND status<>'archived'))));
CREATE POLICY brief_delete ON public.design_briefs FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
    AND p.organization_id=design_briefs.organization_id AND p.is_active IS DISTINCT FROM false
    AND (p.role IN ('admin','manager','service_manager') OR
      (created_by=p.id AND linked_proposal_id IS NULL AND status IN ('draft','submitted')))));

CREATE OR REPLACE FUNCTION public.design_brief_save_session(
  p_brief uuid, p_entry uuid, p_contact uuid, p_lead uuid,
  p_title text, p_content text, p_source text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.design_briefs; actor public.profiles; added integer:=0; v_content text:=btrim(coalesce(p_content,''));
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() AND is_active IS DISTINCT FROM false;
  IF actor.organization_id IS NULL THEN RAISE EXCEPTION 'Organization profile required'; END IF;
  IF p_source NOT IN ('typed','voice') THEN RAISE EXCEPTION 'Invalid session source'; END IF;
  IF p_contact IS NOT NULL AND p_lead IS NOT NULL THEN RAISE EXCEPTION 'Select a contact or lead'; END IF;
  IF p_contact IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=p_contact AND organization_id=actor.organization_id) THEN RAISE EXCEPTION 'Customer not found'; END IF;
  IF p_lead IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.leads WHERE id=p_lead AND organization_id=actor.organization_id) THEN RAISE EXCEPTION 'Lead not found'; END IF;
  INSERT INTO public.design_briefs(id,organization_id,created_by,raw_notes,title,status)
    VALUES(p_brief,actor.organization_id,actor.id,'',coalesce(p_title,''),'draft') ON CONFLICT(id) DO NOTHING;
  SELECT * INTO b FROM public.design_briefs WHERE id=p_brief AND organization_id=actor.organization_id FOR UPDATE;
  IF NOT FOUND OR (b.created_by<>actor.id AND actor.role NOT IN ('admin','manager','service_manager')) THEN RAISE EXCEPTION 'Design brief not found or access denied'; END IF;
  IF b.linked_proposal_id IS NOT NULL OR b.status='archived' THEN RAISE EXCEPTION 'This brief is view only'; END IF;
  IF v_content<>'' THEN
    INSERT INTO public.design_brief_entries(id,organization_id,brief_id,author_id,source,content)
      VALUES(p_entry,actor.organization_id,p_brief,actor.id,p_source,v_content) ON CONFLICT(id) DO NOTHING;
    GET DIAGNOSTICS added=ROW_COUNT;
    IF added=0 AND NOT EXISTS(SELECT 1 FROM public.design_brief_entries WHERE id=p_entry AND brief_id=p_brief AND author_id=actor.id AND design_brief_entries.content=v_content) THEN RAISE EXCEPTION 'Session retry conflicts with saved content'; END IF;
  END IF;
  UPDATE public.design_briefs SET contact_id=p_contact,lead_id=p_lead,title=coalesce(p_title,''),
    raw_notes=CASE WHEN added=1 THEN concat_ws(E'\n\n',nullif(raw_notes,''),v_content) ELSE raw_notes END,
    -- Metadata-only saves retain a valid preview. New notes require regeneration.
    ai_summary=CASE WHEN added=1 OR contact_id IS DISTINCT FROM p_contact OR lead_id IS DISTINCT FROM p_lead THEN NULL ELSE ai_summary END,
    status=CASE WHEN added=1 OR contact_id IS DISTINCT FROM p_contact OR lead_id IS DISTINCT FROM p_lead THEN 'draft' ELSE status END,
    submitted_at=CASE WHEN added=1 OR contact_id IS DISTINCT FROM p_contact OR lead_id IS DISTINCT FROM p_lead THEN NULL ELSE submitted_at END
    WHERE id=p_brief RETURNING * INTO b;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unable to save design brief'; END IF;
  RETURN jsonb_build_object('id',b.id,'raw_notes',b.raw_notes);
END $$;
REVOKE ALL ON FUNCTION public.design_brief_save_session(uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.design_brief_save_session(uuid,uuid,uuid,uuid,text,text,text) TO authenticated;

-- Explicit submission is atomic with notifications, and retries do not notify twice.
CREATE OR REPLACE FUNCTION public.design_brief_submit(p_brief uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.design_briefs; actor public.profiles;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() AND is_active IS DISTINCT FROM false;
  SELECT * INTO b FROM public.design_briefs WHERE id=p_brief AND organization_id=actor.organization_id FOR UPDATE;
  IF NOT FOUND OR (b.created_by<>actor.id AND actor.role NOT IN ('admin','manager','service_manager')) THEN RAISE EXCEPTION 'Design brief not found or access denied'; END IF;
  IF b.linked_proposal_id IS NOT NULL OR b.status='archived' THEN RAISE EXCEPTION 'This brief is view only'; END IF;
  IF b.ai_summary IS NULL OR (b.contact_id IS NULL AND b.lead_id IS NULL) THEN RAISE EXCEPTION 'Customer and AI preview required'; END IF;
  IF b.submitted_at IS NOT NULL THEN RETURN b.id; END IF;
  UPDATE public.design_briefs SET status='submitted',submitted_at=now() WHERE id=b.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unable to submit design brief'; END IF;
  INSERT INTO public.notifications(organization_id,user_id,type,title,body,related_id,is_read)
    SELECT b.organization_id,p.id,'task_assigned','New Design Brief',
      coalesce(actor.full_name,'A sales rep') || ' submitted a design brief. Review the design and select products.',b.id,false
    FROM public.profiles p WHERE p.organization_id=b.organization_id AND p.role IN ('admin','manager','service_manager') AND p.is_active IS DISTINCT FROM false;
  RETURN b.id;
END $$;
REVOKE ALL ON FUNCTION public.design_brief_submit(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.design_brief_submit(uuid) TO authenticated;

-- Lead promotion and proposal conversion share one transaction. Never identify a
-- customer by name alone; names are not unique and a retry must not duplicate it.
CREATE OR REPLACE FUNCTION public.design_brief_convert(
  p_brief uuid, p_contact uuid, p_lead uuid, p_title text,
  p_tax_environment text, p_tax_type text, p_tax_rate numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.design_briefs; actor public.profiles; l public.leads; customer uuid:=p_contact; proposal uuid; office uuid;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() AND is_active IS DISTINCT FROM false AND role IN ('admin','manager','service_manager');
  IF actor.organization_id IS NULL THEN RAISE EXCEPTION 'Manager authorization required'; END IF;
  SELECT * INTO b FROM public.design_briefs WHERE id=p_brief AND organization_id=actor.organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Design brief not found'; END IF;
  IF b.linked_proposal_id IS NOT NULL THEN RETURN b.linked_proposal_id; END IF;
  IF b.status='archived' OR b.ai_summary IS NULL THEN RAISE EXCEPTION 'An active design preview is required'; END IF;
  IF p_lead IS NOT NULL THEN
    IF p_contact IS NOT NULL THEN RAISE EXCEPTION 'Select a customer or lead'; END IF;
    SELECT * INTO l FROM public.leads WHERE id=p_lead AND organization_id=actor.organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;
    SELECT id INTO customer FROM public.contacts WHERE id=l.converted_from_contact_id AND organization_id=actor.organization_id;
    IF customer IS NULL THEN
      office:=coalesce(l.office_id,actor.primary_office_id,actor.default_office_id);
      IF office IS NULL OR NOT EXISTS(SELECT 1 FROM public.offices WHERE id=office AND organization_id=actor.organization_id) THEN
        RAISE EXCEPTION 'Assign an office to the lead before creating its customer';
      END IF;
      INSERT INTO public.contacts(organization_id,contact_name,first_name,last_name,company_name,email,phone,contact_type,username,office_id,created_by)
        VALUES(actor.organization_id,l.contact_name,split_part(btrim(l.contact_name),' ',1),
          nullif(btrim(substr(btrim(l.contact_name),length(split_part(btrim(l.contact_name),' ',1))+1)),''),
          l.company_name,l.email,l.phone,'person','lead'||replace(l.id::text,'-',''),office,actor.id) RETURNING id INTO customer;
    END IF;
  END IF;
  proposal:=public.design_brief_create_proposal(p_brief,customer,p_title,p_tax_environment,p_tax_type,p_tax_rate);
  UPDATE public.design_briefs SET contact_id=customer,lead_id=NULL WHERE id=p_brief;
  IF p_lead IS NOT NULL THEN
    UPDATE public.leads SET converted_from_contact_id=customer,
      status=CASE WHEN status IN ('closed_won','closed_lost') THEN status ELSE 'in_progress' END WHERE id=p_lead;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unable to convert lead'; END IF;
  END IF;
  RETURN proposal;
END $$;
REVOKE ALL ON FUNCTION public.design_brief_convert(uuid,uuid,uuid,text,text,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.design_brief_convert(uuid,uuid,uuid,text,text,text,numeric) TO authenticated;
