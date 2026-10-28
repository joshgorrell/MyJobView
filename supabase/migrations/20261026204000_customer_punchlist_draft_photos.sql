-- Attach photos to an existing unsubmitted customer punchlist draft.
BEGIN;
CREATE OR REPLACE FUNCTION public.add_customer_punchlist_draft_photos(p_project_id uuid,p_task_id uuid,p_photos text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.projects; existing_count integer; new_count integer;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF p.id IS NULL OR NOT private.punchlist_portal_identity(p.contact_id,p.organization_id)
 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT private.project_punchlist_open(p.id) THEN RAISE EXCEPTION 'Punchlist is view-only' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.project_tasks t WHERE t.id=p_task_id AND t.project_id=p.id AND t.organization_id=p.organization_id
 AND t.created_by_contact_id=p.contact_id AND t.source='customer' AND t.status='open' AND t.customer_draft_removed_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM public.project_punchlist_requests r WHERE r.task_id=t.id)
 AND NOT EXISTS (SELECT 1 FROM public.work_order_tasks w WHERE w.project_task_id=t.id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item was submitted or is no longer editable' USING ERRCODE='42501'; END IF;
 IF coalesce(cardinality(p_photos),0)=0 OR cardinality(p_photos)>10 THEN RAISE EXCEPTION 'Choose 1 to 10 photos'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_photos) x GROUP BY x HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate photos'; END IF;
 SELECT count(*) INTO existing_count FROM public.portal_support_photos WHERE task_id=p_task_id;
 SELECT count(*) INTO new_count FROM unnest(p_photos) x
 WHERE NOT EXISTS(SELECT 1 FROM public.portal_support_photos f WHERE f.task_id=p_task_id AND f.storage_path=x);
 IF existing_count+new_count>10 THEN RAISE EXCEPTION 'Maximum 10 photos per item'; END IF;
 PERFORM private.attach_support_photos(p.organization_id,p.contact_id,p_task_id,NULL,
  ARRAY(SELECT x FROM unnest(p_photos) x WHERE NOT EXISTS(SELECT 1 FROM public.portal_support_photos f WHERE f.task_id=p_task_id AND f.storage_path=x)));
 UPDATE public.project_tasks SET updated_at=now() WHERE id=p_task_id;
END; $$;
REVOKE ALL ON FUNCTION public.add_customer_punchlist_draft_photos(uuid,uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_customer_punchlist_draft_photos(uuid,uuid,text[]) TO authenticated;
COMMIT;
