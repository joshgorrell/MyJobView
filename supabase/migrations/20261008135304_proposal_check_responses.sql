ALTER TABLE public.proposal_check_emails
 ADD COLUMN responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 ADD COLUMN response_url text,
 ADD COLUMN response_token text UNIQUE,
 ADD COLUMN response_expires_at timestamptz NOT NULL DEFAULT now() + interval '180 days',
 ADD COLUMN last_opened_at timestamptz;
GRANT SELECT(responsible_user_id,last_opened_at) ON public.proposal_check_emails TO authenticated;
CREATE TABLE public.proposal_check_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email_id uuid NOT NULL REFERENCES public.proposal_check_emails(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 event_key uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('link_visit','interaction','message')),
 choice text NOT NULL CHECK(choice IN ('love_it','considering','needs_work','off_base','declined')),
 step text,
 message text CHECK(char_length(message)<=5000),
 suspected_automated boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(email_id,event_key)
);
CREATE INDEX proposal_check_events_timeline ON public.proposal_check_events(email_id,created_at DESC);
ALTER TABLE public.proposal_check_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.proposal_check_events FROM anon,authenticated;
GRANT SELECT ON public.proposal_check_events TO authenticated;
GRANT ALL ON public.proposal_check_events TO service_role;
CREATE POLICY proposal_check_events_read ON public.proposal_check_events FOR SELECT TO authenticated
 USING (organization_id=public.get_user_org_id() AND EXISTS(SELECT 1 FROM public.proposal_check_emails e WHERE e.id=email_id AND e.organization_id=proposal_check_events.organization_id));
-- Only the token-validating edge endpoint may append events. Serializing per email
-- makes retries idempotent and bounds automated traffic without accepting spoofed tenants.
CREATE FUNCTION public.record_proposal_check_event(p_email_id uuid,p_event_key uuid,p_kind text,p_choice text,p_step text DEFAULT NULL,p_message text DEFAULT NULL,p_automated boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE e public.proposal_check_emails; event_id uuid; recipient uuid;
BEGIN
 SELECT * INTO e FROM public.proposal_check_emails WHERE id=p_email_id FOR UPDATE;
 IF e.id IS NULL OR e.status<>'sent' OR e.response_expires_at<now() THEN RAISE EXCEPTION 'Response link unavailable'; END IF;
 SELECT id INTO event_id FROM public.proposal_check_events WHERE email_id=e.id AND event_key=p_event_key;
 IF event_id IS NOT NULL THEN RETURN event_id; END IF;
 IF (SELECT count(*) FROM public.proposal_check_events WHERE email_id=e.id AND created_at>now()-interval '1 minute')>=60 THEN RAISE EXCEPTION 'Please try again shortly'; END IF;
 IF (SELECT count(*) FROM public.proposal_check_events WHERE email_id=e.id)>=10000 THEN RAISE EXCEPTION 'Response limit reached'; END IF;
 INSERT INTO public.proposal_check_events(email_id,organization_id,event_key,kind,choice,step,message,suspected_automated)
 VALUES(e.id,e.organization_id,p_event_key,p_kind,p_choice,p_step,p_message,p_automated) RETURNING id INTO event_id;
 IF p_kind='message' THEN
  SELECT id INTO recipient FROM public.profiles WHERE id IN(e.responsible_user_id,e.sent_by) AND organization_id=e.organization_id AND is_active AND (role IN('admin','owner','super_admin') OR can_manage_customer_feedback) ORDER BY (id=e.responsible_user_id) DESC NULLS LAST LIMIT 1;
  IF recipient IS NOT NULL THEN
   INSERT INTO public.notifications(user_id,organization_id,type,related_id,title,body)
   VALUES(recipient,e.organization_id,'review_request',e.id,'Proposal check feedback received',e.recipient_name || ': ' || coalesce(p_step,p_choice) || CASE WHEN coalesce(p_message,'')<>'' THEN ' — ' || left(p_message,250) ELSE '' END);
  END IF;
 END IF;
 RETURN event_id;
END; $$;
REVOKE ALL ON FUNCTION public.record_proposal_check_event(uuid,uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_proposal_check_event(uuid,uuid,text,text,text,text,boolean) TO service_role;
CREATE FUNCTION public.record_proposal_check_open(p_token text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 UPDATE public.proposal_check_emails SET opened_at=coalesce(opened_at,now()),last_opened_at=now() WHERE open_token=p_token AND status<>'failed';
$$;
REVOKE ALL ON FUNCTION public.record_proposal_check_open(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_proposal_check_open(text) TO service_role;
CREATE VIEW public.proposal_check_reporting WITH(security_invoker=true) AS
 SELECT e.id,e.organization_id,e.sent_by,e.proposal_id,e.recipient_name,e.recipient_email,e.sender_name,e.reply_to,e.subject,e.variant,e.created_at,e.sent_at,e.opened_at,e.last_opened_at,e.status,
 (SELECT count(*)::int FROM public.proposal_check_events v WHERE v.email_id=e.id AND v.kind='link_visit') AS click_count,
 (SELECT count(*)::int FROM public.proposal_check_events v WHERE v.email_id=e.id AND v.kind='interaction') AS interaction_count,
 (SELECT count(*)::int FROM public.proposal_check_events v WHERE v.email_id=e.id AND v.kind='message') AS message_count,
 (SELECT v.choice FROM public.proposal_check_events v WHERE v.email_id=e.id ORDER BY v.created_at DESC,v.id DESC LIMIT 1) AS latest_choice,
 (SELECT v.choice FROM public.proposal_check_events v WHERE v.email_id=e.id AND v.kind<>'link_visit' ORDER BY v.created_at DESC,v.id DESC LIMIT 1) AS confirmed_choice,
 (SELECT v.created_at FROM public.proposal_check_events v WHERE v.email_id=e.id AND v.kind='link_visit' ORDER BY v.created_at DESC LIMIT 1) AS last_clicked_at
 FROM public.proposal_check_emails e;
REVOKE ALL ON public.proposal_check_reporting FROM PUBLIC,anon;
GRANT SELECT ON public.proposal_check_reporting TO authenticated,service_role;
COMMENT ON COLUMN public.proposal_check_events.suspected_automated IS 'Known scanner user-agent hint; false does not prove a human click.';

DROP POLICY proposal_check_history_read ON public.proposal_check_emails;
CREATE POLICY proposal_check_history_read ON public.proposal_check_emails FOR SELECT TO authenticated USING (
 organization_id=public.get_user_org_id() AND public.flow_has_module_access('reviews')
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=proposal_check_emails.organization_id AND p.is_active
 AND (p.role IN('admin','owner','super_admin') OR p.can_manage_customer_feedback)
 AND (p.role IN('admin','owner','super_admin') OR p.can_see_all_review_requests OR proposal_check_emails.sent_by=auth.uid() OR proposal_check_emails.responsible_user_id=auth.uid()))
);
