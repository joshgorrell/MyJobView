-- Expose source, timestamps and canonical request status in the staff-only Test & Tune workspace.
BEGIN;
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS customer_draft_removed_at timestamptz;
CREATE OR REPLACE FUNCTION public.get_test_tune_workspace()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; result jsonb;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF org IS NULL OR NOT private.punchlist_staff_access(org) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(row_data ORDER BY customer,project_name),'[]'::jsonb) INTO result FROM (
 SELECT coalesce(c.full_name,c.company_name,'Customer') customer,p.name project_name,
 jsonb_build_object('id',p.id,'contact_id',p.contact_id,'name',p.name,'number',p.project_number,
 'customer',coalesce(c.full_name,c.company_name,'Customer'),'end_date',p.substantial_completion_date+90,
 'can_submit',private.project_punchlist_open(p.id),
 'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,
 'customer_description',t.customer_description,'photos',coalesce((SELECT jsonb_agg(f.storage_path ORDER BY f.created_at) FROM public.portal_support_photos f WHERE f.task_id=t.id AND f.organization_id=org),'[]'::jsonb),'visibility',t.visibility,'status',t.status,'source',t.source,'created_at',t.created_at,'updated_at',t.updated_at,
 'service_status',(SELECT CASE WHEN EXISTS (SELECT 1 FROM public.work_order_tasks wt JOIN public.work_orders wo ON wo.id=wt.work_order_id WHERE wt.project_task_id=t.id AND wt.organization_id=org AND wo.status='completed') AND NOT EXISTS (SELECT 1 FROM public.work_order_tasks wt JOIN public.work_orders wo ON wo.id=wt.work_order_id WHERE wt.project_task_id=t.id AND wt.organization_id=org AND wo.status <> 'completed') THEN 'completed' ELSE s.status END FROM public.project_punchlist_requests r JOIN public.service_requests s ON s.id=r.request_id WHERE r.task_id=t.id AND r.organization_id=org AND s.organization_id=org ORDER BY s.created_at DESC LIMIT 1),
 'request_id',(SELECT r.request_id FROM public.project_punchlist_requests r JOIN public.service_requests s ON s.id=r.request_id
 WHERE r.task_id=t.id AND r.organization_id=org AND s.organization_id=org ORDER BY s.created_at DESC,r.request_id LIMIT 1)) ORDER BY t.updated_at DESC NULLS LAST,t.created_at DESC,t.id)
 FROM public.project_tasks t WHERE t.project_id=p.id AND t.organization_id=org AND t.is_test_and_tune AND t.customer_draft_removed_at IS NULL),'[]')) row_data
 FROM public.projects p JOIN public.contacts c ON c.id=p.contact_id AND c.organization_id=p.organization_id
 WHERE p.organization_id=org AND p.substantial_completion_date<=CURRENT_DATE
 ) projects;
 RETURN result;
END; $$;

COMMIT;
