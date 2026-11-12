-- Atomic voicemail ownership transition and audit entry.
-- Called only with service role after the Edge Function authenticates the actor,
-- validates tenant membership, department rights and assignee eligibility.
CREATE OR REPLACE FUNCTION public.commit_phone_voicemail_assignment(
 p_organization_id uuid, p_voicemail_id uuid, p_actor_user_id uuid,
 p_expected_department text, p_expected_assignee uuid, p_expected_status text,
 p_department text, p_assignee uuid, p_status text, p_note text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE previous record;
BEGIN
 SELECT department, assigned_user_id, workflow_status INTO previous
 FROM public.voicemail_messages
 WHERE id = p_voicemail_id AND organization_id = p_organization_id
 FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF previous.department IS DISTINCT FROM p_expected_department
 OR previous.assigned_user_id IS DISTINCT FROM p_expected_assignee
 OR previous.workflow_status IS DISTINCT FROM p_expected_status THEN RETURN false; END IF;
 UPDATE public.voicemail_messages SET department = p_department,
 assigned_user_id = p_assignee, workflow_status = p_status,
 completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE NULL END,
 completed_by = CASE WHEN p_status = 'completed' THEN p_actor_user_id ELSE NULL END,
 updated_at = now()
 WHERE id = p_voicemail_id AND organization_id = p_organization_id;
 INSERT INTO public.phone_voicemail_assignment_history
 (organization_id,voicemail_id,actor_user_id,from_department,to_department,
 from_user_id,to_user_id,from_status,to_status,note)
 VALUES (p_organization_id,p_voicemail_id,p_actor_user_id,
 previous.department,p_department,previous.assigned_user_id,p_assignee,
 previous.workflow_status,p_status,p_note);
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.commit_phone_voicemail_assignment(uuid,uuid,uuid,text,uuid,text,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_phone_voicemail_assignment(uuid,uuid,uuid,text,uuid,text,text,uuid,text,text) TO service_role;
