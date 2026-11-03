-- Customer drafts must enter the canonical staff Test & Tune feed immediately.
BEGIN;
CREATE OR REPLACE FUNCTION public.submit_project_punchlist_item(p_project_id uuid,p_description text,p_submission_id uuid,p_photos text[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.projects; result uuid;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF p.id IS NULL OR NOT private.punchlist_portal_identity(p.contact_id,p.organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 -- A retry can return the committed item even if entitlement expires between calls.
 SELECT id INTO result FROM public.project_tasks WHERE id=p_submission_id AND project_id=p.id AND created_by_contact_id=p.contact_id AND source='customer';
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF NOT private.project_punchlist_open(p.id) THEN RAISE EXCEPTION 'Project Punchlist is now view-only' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_description),'') IS NULL OR length(p_description)>10000 OR p_submission_id IS NULL THEN RAISE EXCEPTION 'Describe what needs attention (up to 10,000 characters)'; END IF;
 INSERT INTO public.project_tasks(id,project_id,organization_id,title,customer_description,source,visibility,created_by_contact_id,status,is_test_and_tune)
 VALUES(p_submission_id,p.id,p.organization_id,btrim(p_description),btrim(p_description),'customer','customer_visible',p.contact_id,'open',true) RETURNING id INTO result;
 PERFORM private.attach_support_photos(p.organization_id,p.contact_id,result,NULL,p_photos);
 RETURN result;
END; $$;

COMMIT;
