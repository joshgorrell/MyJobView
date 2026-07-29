/*
  # Update Customer Question Email Link to Deep-Link into QA Panel

  Updates the existing notify_customer_question() trigger function to:
  - Look up app_url from company_settings (the main application URL).
  - Build the email link as {app_url}/proposals-fullscreen?id={proposal_id}&openQA=true&threadId={thread_id}
     so the rep lands directly in the Q&A reply panel.
  - Pass proposalUrl in the pg_net payload so the edge function uses it directly.

  The edge function (send-proposal-question-email) will be updated separately
  to accept and use the proposalUrl field from the payload instead of
  constructing it from portal_url.
*/

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

  IF NOT FOUND OR v_thread.assigned_sales_rep_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_org_id := v_thread.organization_id;

  -- Insert in-app notification for the assigned rep
  INSERT INTO notifications (
    organization_id, user_id, type, title, body,
    related_id, is_read, created_at
  )
  VALUES (
    v_org_id,
    v_thread.assigned_sales_rep_id,
    'customer_question',
    'New question on ' || COALESCE(v_thread.subject, 'a proposal'),
    LEFT(NEW.body, 200),
    v_thread.proposal_id,
    false,
    now()
  );

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
