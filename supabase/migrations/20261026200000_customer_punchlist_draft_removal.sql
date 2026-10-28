-- Hide a customer's unsubmitted draft without deleting its audit history or photos.
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS customer_draft_removed_at timestamptz;
CREATE OR REPLACE FUNCTION public.remove_customer_punchlist_draft(p_project_id uuid,p_task_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.projects;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF p.id IS NULL OR NOT private.punchlist_portal_identity(p.contact_id,p.organization_id)
 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT private.project_punchlist_open(p.id) THEN RAISE EXCEPTION 'Punchlist is view-only' USING ERRCODE='42501'; END IF;
 UPDATE public.project_tasks t SET customer_draft_removed_at=now()
 WHERE t.id=p_task_id AND t.project_id=p.id AND t.organization_id=p.organization_id
 AND t.created_by_contact_id=p.contact_id AND t.source='customer' AND t.status='open'
 AND t.customer_draft_removed_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM public.project_punchlist_requests r WHERE r.task_id=t.id)
 AND NOT EXISTS (SELECT 1 FROM public.work_order_tasks w WHERE w.project_task_id=t.id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Item was submitted or is no longer removable'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.remove_customer_punchlist_draft(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.remove_customer_punchlist_draft(uuid,uuid) TO authenticated;
