-- One conversation store for Flow and the customer portal. Replace legacy
-- permissive policies; adding a restrictive policy alone would not close them.
CREATE OR REPLACE FUNCTION public.portal_owns_conversation(p_thread uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.message_threads t
  JOIN public.profiles me ON me.id=auth.uid() AND me.organization_id=t.organization_id AND me.is_active
  JOIN public.contacts c ON c.id=t.contact_id AND c.organization_id=t.organization_id
  WHERE t.id=p_thread AND t.visibility IN ('public','customer')
    AND me.contact_id=c.id
 );
$$;
REVOKE ALL ON FUNCTION public.portal_owns_conversation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.portal_owns_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_reply_customer_conversation(p_thread uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.message_threads;
BEGIN
 IF NOT public.portal_owns_conversation(p_thread) THEN RETURN false; END IF;
 SELECT * INTO t FROM public.message_threads WHERE id=p_thread;
 IF t.context_type='proposal' THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.get_punchlist_access_info(t.contact_id) a WHERE a.has_access);
END $$;
REVOKE ALL ON FUNCTION public.can_reply_customer_conversation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_reply_customer_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_can_use_conversation(p_thread uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.flow_has_module_access('messages') AND public.flow_can_view_thread(p_thread);
$$;
REVOKE ALL ON FUNCTION public.staff_can_use_conversation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_can_use_conversation(uuid) TO authenticated;

ALTER TABLE public.message_threads DROP CONSTRAINT IF EXISTS message_threads_context_type_check;
ALTER TABLE public.message_threads ADD CONSTRAINT message_threads_context_type_check CHECK(context_type IN ('contact','proposal','project','punchlist','work_order'));

-- Retain existing threads/history. Canonical ownership resolves old context-only rows.
UPDATE public.message_threads t SET contact_id=p.contact_id FROM public.proposals p
 WHERE t.contact_id IS NULL AND t.context_type='proposal' AND p.id=t.context_id AND p.organization_id=t.organization_id;
UPDATE public.message_threads t SET contact_id=p.contact_id FROM public.projects p
 WHERE t.contact_id IS NULL AND t.context_type='project' AND p.id=t.context_id AND p.organization_id=t.organization_id;
UPDATE public.message_threads t SET contact_id=w.contact_id FROM public.work_orders w
 WHERE t.contact_id IS NULL AND t.context_type='work_order' AND w.id=t.context_id AND w.organization_id=t.organization_id;
UPDATE public.message_threads t SET contact_id=c.id FROM public.contacts c
 WHERE t.contact_id IS NULL AND t.context_type='contact' AND c.id=t.context_id AND c.organization_id=t.organization_id;

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('message_threads','messages') LOOP
  EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
 END LOOP;
END $$;
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversation_read ON public.message_threads FOR SELECT TO authenticated
 USING(public.staff_can_use_conversation(id) OR public.portal_owns_conversation(id));
CREATE POLICY conversation_create ON public.message_threads FOR INSERT TO authenticated WITH CHECK(
 created_by=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active AND p.organization_id=message_threads.organization_id AND
  ((p.contact_id IS NULL AND public.flow_has_module_access('messages')) OR
   (p.contact_id=message_threads.contact_id AND message_threads.context_type='proposal' AND message_threads.visibility='public'))));
CREATE POLICY conversation_update ON public.message_threads FOR UPDATE TO authenticated
 USING(public.staff_can_use_conversation(id)) WITH CHECK(public.staff_can_use_conversation(id));
CREATE POLICY conversation_delete ON public.message_threads FOR DELETE TO authenticated
 USING(public.staff_can_use_conversation(id) AND (created_by=auth.uid() OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id=message_threads.organization_id AND p.role='admin')));
CREATE POLICY conversation_message_read ON public.messages FOR SELECT TO authenticated
 USING(public.staff_can_use_conversation(thread_id) OR (NOT is_internal AND public.portal_owns_conversation(thread_id)));
CREATE POLICY conversation_message_create ON public.messages FOR INSERT TO authenticated WITH CHECK(
 author_id=auth.uid() AND ((author_type='staff' AND public.staff_can_use_conversation(thread_id))
 OR (author_type='customer' AND NOT is_internal AND public.can_reply_customer_conversation(thread_id))));
CREATE POLICY conversation_message_update ON public.messages FOR UPDATE TO authenticated
 USING(public.staff_can_use_conversation(thread_id)) WITH CHECK(public.staff_can_use_conversation(thread_id));
CREATE POLICY conversation_message_delete ON public.messages FOR DELETE TO authenticated
 USING(author_id=auth.uid() AND public.staff_can_use_conversation(thread_id));

-- Stamp authoritative author/tenant and recipient read state. Customers cannot
-- impersonate employees or mark their own outgoing reply read by the team.
CREATE OR REPLACE FUNCTION flow_private.guard_conversation_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.message_threads; p public.profiles;
BEGIN
 SELECT * INTO t FROM public.message_threads WHERE id=NEW.thread_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversation unavailable'; END IF;
 IF auth.uid() IS NOT NULL THEN
  SELECT * INTO p FROM public.profiles WHERE id=auth.uid() AND is_active;
  IF NOT FOUND OR p.organization_id IS DISTINCT FROM t.organization_id THEN RAISE EXCEPTION 'Conversation unavailable'; END IF;
  IF TG_OP='UPDATE' THEN
   IF (to_jsonb(NEW)-'is_read') IS DISTINCT FROM (to_jsonb(OLD)-'is_read') THEN
    RAISE EXCEPTION 'Messages cannot be rewritten';
   END IF;
  ELSE
   NEW.author_id:=p.id; NEW.author_name:=coalesce(p.full_name,'Customer');
   NEW.author_type:=CASE WHEN p.contact_id IS NULL THEN 'staff' ELSE 'customer' END;
   IF p.contact_id IS NOT NULL THEN NEW.is_internal:=false; END IF;
   NEW.is_internal:=coalesce(NEW.is_internal,false) OR t.visibility='internal';
   NEW.is_read:=NEW.is_internal;
  END IF;
 END IF;
 NEW.organization_id:=t.organization_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION flow_private.guard_conversation_message() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_conversation_message BEFORE INSERT OR UPDATE ON public.messages
 FOR EACH ROW EXECUTE FUNCTION flow_private.guard_conversation_message();

CREATE OR REPLACE FUNCTION public.mark_customer_conversation_read(p_thread uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.portal_owns_conversation(p_thread) THEN RAISE EXCEPTION 'Conversation unavailable'; END IF;
 UPDATE public.messages SET is_read=true WHERE thread_id=p_thread AND author_type='staff' AND NOT is_internal AND NOT is_read;
 UPDATE public.notifications SET is_read=true WHERE user_id=auth.uid() AND related_id=p_thread AND type='message';
END $$;
REVOKE ALL ON FUNCTION public.mark_customer_conversation_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_customer_conversation_read(uuid) TO authenticated;

-- Preserve the dealer's existing notification types while enabling the Flow
-- mention types already produced by its messaging triggers.
DO $$ DECLARE v_expression text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO v_expression FROM pg_constraint
 WHERE conrelid='public.notifications'::regclass AND conname='notifications_type_check';
 IF v_expression IS NOT NULL THEN
  ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  EXECUTE 'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (('||v_expression||') OR type IN (''message_mention'',''discussion_post_mention'',''flow_update_mention''))';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION flow_private.notify_portal_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.message_threads;
BEGIN
 SELECT * INTO t FROM public.message_threads WHERE id=NEW.thread_id;
 UPDATE public.message_threads SET last_message_at=NEW.created_at WHERE id=t.id;
 IF NEW.author_type='staff' AND NOT NEW.is_internal AND t.visibility IN ('public','customer') THEN
  INSERT INTO public.notifications(organization_id,user_id,type,title,body,related_id,is_read)
  SELECT t.organization_id,p.id,'message','New message: '||coalesce(t.subject,'Customer conversation'),left(NEW.body,200),t.id,false
  FROM public.profiles p WHERE p.contact_id=t.contact_id AND p.organization_id=t.organization_id AND p.is_active;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION flow_private.notify_portal_reply() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER notify_portal_reply AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION flow_private.notify_portal_reply();

-- Current question email transport remains one-way. General customer replies
-- get a thread link instead of a null proposal link. Keep only one legacy trigger.
DROP TRIGGER IF EXISTS notify_on_customer_question_trigger ON public.messages;

CREATE OR REPLACE FUNCTION notify_customer_question()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread message_threads%ROWTYPE;
  v_proposal RECORD;
  v_rep_email text;
  v_rep_name text;
  v_customer_name text;
  v_org_id uuid;
  v_net_url text;
  v_anon_key text;
  v_app_url text;
  v_proposal_url text;
  v_payload jsonb;
BEGIN
  IF NEW.author_type <> 'customer' OR COALESCE(NEW.is_internal, false) = true THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_thread FROM message_threads WHERE id = NEW.thread_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_thread.assigned_sales_rep_id := coalesce(v_thread.assigned_sales_rep_id,
    (SELECT c.assigned_to FROM contacts c WHERE c.id=v_thread.contact_id AND c.organization_id=v_thread.organization_id),
    (SELECT p.id FROM profiles p WHERE p.id=v_thread.created_by AND p.contact_id IS NULL AND p.organization_id=v_thread.organization_id),
    (SELECT p.id FROM profiles p WHERE p.role='admin' AND p.is_active AND p.contact_id IS NULL AND p.organization_id=v_thread.organization_id ORDER BY p.id LIMIT 1));
  IF v_thread.assigned_sales_rep_id IS NULL THEN RETURN NEW; END IF;
  v_org_id := v_thread.organization_id;

  -- Insert in-app notification for the assigned rep
  INSERT INTO notifications (
    organization_id, user_id, type, title, body,
    related_id, is_read, created_at
  )
  VALUES (
    v_org_id,
    v_thread.assigned_sales_rep_id,
    'message',
    'New question on ' || COALESCE(v_thread.subject, 'a proposal'),
    LEFT(NEW.body, 200),
    v_thread.id,
    false,
    now()
  );

  IF v_thread.proposal_id IS NULL THEN RETURN NEW; END IF;

  -- Gather data for email
  SELECT p.proposal_number, p.title, c.full_name
  INTO v_proposal
  FROM proposals p
  LEFT JOIN contacts c ON c.id = p.contact_id
  WHERE p.id = v_thread.proposal_id;

  SELECT pr.email, pr.full_name
  INTO v_rep_email, v_rep_name
  FROM profiles pr
  WHERE pr.id = v_thread.assigned_sales_rep_id;

  v_customer_name := COALESCE(v_proposal.full_name, NEW.author_name, 'Customer');

  -- Get app_url for the deep link
  SELECT cs.app_url INTO v_app_url
  FROM company_settings cs
  WHERE cs.organization_id=v_org_id
  LIMIT 1;

  v_app_url := COALESCE(v_app_url, '');

  -- Build the deep-link URL that opens the QA panel directly
  IF v_app_url IS NOT NULL AND v_app_url <> '' THEN
    v_proposal_url := v_app_url || '/proposals-fullscreen?id=' || v_thread.proposal_id || '&openQA=true&threadId=' || NEW.thread_id;
  ELSE
    v_proposal_url := '/proposals-fullscreen?id=' || v_thread.proposal_id || '&openQA=true&threadId=' || NEW.thread_id;
  END IF;

  v_net_url := current_setting('app.supabase_url', true);
  IF v_net_url IS NULL OR v_net_url = '' THEN
    v_net_url := '';
  END IF;
  v_anon_key := current_setting('app.supabase_anon_key', true);

  v_payload := jsonb_build_object(
    'threadId', NEW.thread_id,
    'messageId', NEW.id,
    'messageBody', NEW.body,
    'contextLabel', NEW.context_label,
    'proposalNumber', v_proposal.proposal_number,
    'proposalTitle', v_proposal.title,
    'proposalId', v_thread.proposal_id,
    'customerName', v_customer_name,
    'repEmail', v_rep_email,
    'repName', v_rep_name,
    'authorName', NEW.author_name,
    'proposalUrl', v_proposal_url
  );

  BEGIN
    IF v_net_url IS NOT NULL AND v_net_url <> '' THEN
      PERFORM net.http_post(
        url := v_net_url || '/functions/v1/send-proposal-question-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key
        ),
        body := v_payload
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- New staff conversations must refer to records inside their dealer. Existing
-- conversations can be renamed, but cannot be redirected to a different customer.
CREATE OR REPLACE FUNCTION flow_private.guard_conversation_thread() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_contact uuid; v_org uuid; v_profile public.profiles;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF auth.uid() IS NOT NULL AND (NEW.company_id,NEW.organization_id,NEW.contact_id,NEW.context_type,NEW.context_id,NEW.proposal_id,NEW.created_by,NEW.visibility)
    IS DISTINCT FROM (OLD.company_id,OLD.organization_id,OLD.contact_id,OLD.context_type,OLD.context_id,OLD.proposal_id,OLD.created_by,OLD.visibility) THEN
   RAISE EXCEPTION 'Conversation ownership cannot be changed';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO v_profile FROM public.profiles WHERE id=auth.uid() AND is_active;
 v_org:=v_profile.organization_id;
 NEW.organization_id:=coalesce(NEW.organization_id,v_org);
 NEW.company_id:=NEW.organization_id;
 IF auth.uid() IS NOT NULL THEN NEW.created_by:=auth.uid(); END IF;
 IF auth.uid() IS NOT NULL AND NEW.organization_id IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'Conversation unavailable'; END IF;
 CASE NEW.context_type
  WHEN 'contact' THEN SELECT id INTO v_contact FROM public.contacts WHERE id=NEW.context_id AND organization_id=NEW.organization_id;
  WHEN 'proposal' THEN SELECT contact_id INTO v_contact FROM public.proposals WHERE id=NEW.context_id AND organization_id=NEW.organization_id;
  WHEN 'project' THEN SELECT contact_id INTO v_contact FROM public.projects WHERE id=NEW.context_id AND organization_id=NEW.organization_id;
  WHEN 'punchlist' THEN SELECT contact_id INTO v_contact FROM public.punchlist_tasks WHERE id=NEW.context_id AND organization_id=NEW.organization_id;
  WHEN 'work_order' THEN SELECT contact_id INTO v_contact FROM public.work_orders WHERE id=NEW.context_id AND organization_id=NEW.organization_id;
  ELSE RAISE EXCEPTION 'Unsupported customer conversation context';
 END CASE;
 IF v_contact IS NULL OR (NEW.contact_id IS NOT NULL AND NEW.contact_id<>v_contact) THEN RAISE EXCEPTION 'Conversation customer mismatch'; END IF;
 NEW.contact_id:=v_contact;
 IF v_profile.contact_id IS NOT NULL AND (v_profile.contact_id<>v_contact OR NEW.context_type<>'proposal' OR NEW.visibility<>'public') THEN
  -- The general-conversation RPC is the only support-program creation path.
  IF NEW.context_type<>'contact' OR v_profile.contact_id<>v_contact OR NEW.visibility<>'public' OR NOT EXISTS(SELECT 1 FROM public.get_punchlist_access_info(v_contact) a WHERE a.has_access) THEN RAISE EXCEPTION 'Conversation unavailable'; END IF;
 END IF;
 IF v_profile.contact_id IS NOT NULL AND NEW.context_type='proposal' THEN
  SELECT created_by INTO NEW.assigned_sales_rep_id FROM public.proposals WHERE id=NEW.context_id AND organization_id=NEW.organization_id;
 END IF;
 IF NEW.context_type='proposal' THEN NEW.proposal_id:=NEW.context_id;
 ELSIF NEW.proposal_id IS NOT NULL THEN RAISE EXCEPTION 'Conversation proposal mismatch'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION flow_private.guard_conversation_thread() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_conversation_thread BEFORE INSERT OR UPDATE ON public.message_threads
 FOR EACH ROW EXECUTE FUNCTION flow_private.guard_conversation_thread();

-- Private images obey the same conversation permissions, including staff-only
-- notes inside a public thread. An uploaded image is customer readable only
-- after it is attached to a public message (or is that customer's own upload).
CREATE OR REPLACE FUNCTION public.conversation_attachment_access(p_name text,p_upload boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_thread uuid; t public.message_threads;
BEGIN
 IF split_part(p_name,'/',2) !~ '^[0-9a-fA-F-]{36}$' THEN RETURN false; END IF;
 BEGIN v_thread:=split_part(p_name,'/',2)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 SELECT * INTO t FROM public.message_threads WHERE id=v_thread;
 IF NOT FOUND OR split_part(p_name,'/',1)<>t.organization_id::text THEN RETURN false; END IF;
 IF public.staff_can_use_conversation(t.id) THEN RETURN true; END IF;
 IF p_upload THEN RETURN public.can_reply_customer_conversation(t.id); END IF;
 RETURN public.portal_owns_conversation(t.id) AND EXISTS(
  SELECT 1 FROM public.messages m WHERE m.thread_id=t.id AND NOT m.is_internal AND m.attachment_type='image'
   AND right(split_part(m.attachment_url,'?',1),length('/message-attachments/'||p_name))='/message-attachments/'||p_name);
END $$;
REVOKE ALL ON FUNCTION public.conversation_attachment_access(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.conversation_attachment_access(text,boolean) TO authenticated;
DROP POLICY IF EXISTS "Staff can upload message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Portal users can read message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Portal users can upload message attachments" ON storage.objects;
CREATE POLICY conversation_image_read ON storage.objects FOR SELECT TO authenticated USING(
 bucket_id='message-attachments' AND (public.conversation_attachment_access(name) OR
 (owner_id=auth.uid()::text AND public.conversation_attachment_access(name,true))));
CREATE POLICY conversation_image_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(
 bucket_id='message-attachments' AND public.conversation_attachment_access(name,true));
CREATE POLICY conversation_image_delete ON storage.objects FOR DELETE TO authenticated USING(
 bucket_id='message-attachments' AND owner_id=auth.uid()::text AND public.conversation_attachment_access(name,true));
UPDATE storage.buckets SET public=false WHERE id='message-attachments';

-- Portal customers may start a general conversation while their support program
-- is active. Thread and first message are committed together.
CREATE OR REPLACE FUNCTION public.start_customer_conversation(p_subject text,p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles; c public.contacts; v_id uuid;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid() AND is_active AND contact_id IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer unavailable'; END IF;
 SELECT * INTO c FROM public.contacts WHERE id=p.contact_id AND organization_id=p.organization_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.get_punchlist_access_info(c.id) a WHERE a.has_access) THEN RAISE EXCEPTION 'Active support access required'; END IF;
 IF length(trim(p_subject)) NOT BETWEEN 1 AND 200 OR length(trim(p_body)) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Enter a subject and message'; END IF;
 INSERT INTO public.message_threads(organization_id,contact_id,context_type,context_id,subject,visibility,created_by,assigned_sales_rep_id)
 VALUES(p.organization_id,c.id,'contact',c.id,trim(p_subject),'public',p.id,c.assigned_to) RETURNING id INTO v_id;
 INSERT INTO public.messages(thread_id,organization_id,author_id,author_name,author_type,body,is_internal,is_read)
 VALUES(v_id,p.organization_id,p.id,p.full_name,'customer',trim(p_body),false,false);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.start_customer_conversation(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_customer_conversation(text,text) TO authenticated;

DROP TRIGGER IF EXISTS on_customer_question_insert ON public.messages;
CREATE TRIGGER on_customer_question_insert AFTER INSERT ON public.messages
 FOR EACH ROW EXECUTE FUNCTION public.notify_customer_question();

DO $$ DECLARE v_table text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  FOREACH v_table IN ARRAY ARRAY['messages','message_threads','notifications'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=v_table) THEN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',v_table);
   END IF;
  END LOOP;
 END IF;
END $$;
