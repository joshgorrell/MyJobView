-- Keep soft-removed customer drafts out of the customer portal.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_customer_support(p_contact_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; result jsonb;
BEGIN
 SELECT organization_id INTO org FROM public.contacts WHERE id=p_contact_id;
 IF org IS NULL OR NOT (private.punchlist_portal_identity(p_contact_id,org) OR private.punchlist_staff_identity(org)) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('organization_id',org,'vip_service_access',private.vip_service_entitled(p_contact_id,org),
 'submission_updates_enabled',(SELECT test_tune_submission_updates_enabled FROM public.contacts WHERE id=p_contact_id AND organization_id=org),
 'submission_updates',coalesce((SELECT jsonb_agg(jsonb_build_object('request_id',r.request_id,'project_id',r.project_id,'item_count',cardinality(r.task_ids),'submitted_at',r.submitted_at) ORDER BY r.submitted_at DESC)
 FROM public.test_tune_submissions r JOIN public.contacts c ON c.id=r.contact_id AND c.organization_id=r.organization_id
 WHERE r.contact_id=p_contact_id AND r.organization_id=org AND r.source='test_and_tune' AND c.test_tune_submission_updates_enabled),'[]'),
 'projects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'number',p.project_number,'end_date',p.substantial_completion_date+90,'days_remaining',greatest(0,p.substantial_completion_date+90-CURRENT_DATE),'can_submit',private.project_punchlist_open(p.id),
 'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'description',t.customer_description,'status',t.status,'progress',t.progress_status,'source',t.source,
 'requested',EXISTS(SELECT 1 FROM public.project_punchlist_requests r JOIN public.service_requests s ON s.id=r.request_id WHERE r.task_id=t.id) OR EXISTS(SELECT 1 FROM public.punchlist_tasks l WHERE l.id=t.legacy_punchlist_id AND l.service_request_id IS NOT NULL AND l.status<>'completed'),
 'photos',coalesce((SELECT jsonb_agg(f.storage_path) FROM public.portal_support_photos f WHERE f.task_id=t.id),'[]'),'legacy_photos',coalesce((SELECT jsonb_agg(f.photo_url) FROM public.punchlist_task_photos f WHERE f.task_id=t.legacy_punchlist_id),'[]')) ORDER BY t.sort_order,t.created_at)
 FROM public.project_tasks t WHERE t.project_id=p.id AND t.organization_id=org AND t.visibility='customer_visible' AND t.customer_draft_removed_at IS NULL AND nullif(btrim(t.customer_description),'') IS NOT NULL),'[]')) ORDER BY p.substantial_completion_date DESC)
 FROM public.projects p WHERE p.contact_id=p_contact_id AND p.organization_id=org AND p.substantial_completion_date<=CURRENT_DATE),'[]'),
 'requests',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'description',s.job_description,'status',s.status,'created_at',s.created_at,
 'photos',coalesce((SELECT jsonb_agg(f.storage_path) FROM public.portal_support_photos f WHERE f.request_id=s.id),'[]')) ORDER BY s.created_at DESC)
 FROM public.service_requests s WHERE s.contact_id=p_contact_id AND s.organization_id=org AND s.source_type='customer_portal' AND s.request_type='service'),'[]'),
 'legacy_items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'description',coalesce(nullif(btrim(l.details),''),l.title),'status',l.status)) FROM public.punchlist_tasks l
 WHERE l.contact_id=p_contact_id AND l.organization_id=org AND NOT EXISTS(SELECT 1 FROM public.project_tasks t WHERE t.legacy_punchlist_id=l.id)),'[]')) INTO result;
 RETURN result;
END; $$;
COMMIT;
