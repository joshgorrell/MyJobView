-- Enrich the existing event; do not emit a second notification/event per change.
-- get_flow_events already includes activity_recipient_user_id in My Work.
CREATE OR REPLACE FUNCTION flow_private.service_request_creator_flow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request_record public.service_requests%ROWTYPE;
BEGIN
  IF NEW.source_table = 'service_requests' THEN
    SELECT * INTO request_record FROM public.service_requests
    WHERE id = NEW.source_id AND organization_id = NEW.organization_id;
  ELSIF NEW.source_table = 'customer_contact_log' THEN
    SELECT s.* INTO request_record FROM public.customer_contact_log l
    JOIN public.service_requests s ON s.id = l.service_request_id
      AND s.organization_id = l.organization_id
    WHERE l.id = NEW.source_id AND l.organization_id = NEW.organization_id;
    -- An unsuccessful call is still an attempt, not confirmed customer contact.
    NEW.summary := 'Customer contact activity logged';
    NEW.details := 'Open the activity to read the contact method, outcome, and notes.';
  ELSE
    RETURN NEW;
  END IF;
  IF request_record.id IS NOT NULL THEN
    -- A request-linked contact log belongs to the request even when it also
    -- carries a work-order ID. The creator need not have work-order access.
    NEW.required_module := 'service_requests';
    SELECT p.id INTO NEW.activity_recipient_user_id FROM public.profiles p
    WHERE p.id = request_record.created_by AND p.organization_id = NEW.organization_id;
    IF NEW.source_table = 'service_requests' THEN
      NEW.summary := replace(replace(NEW.summary, 'pending customer', 'Waiting on customer'), '· closed', '· Done');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION flow_private.service_request_creator_flow() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER service_request_creator_flow BEFORE INSERT ON public.flow_events
FOR EACH ROW WHEN (NEW.source_table IN ('service_requests', 'customer_contact_log'))
EXECUTE FUNCTION flow_private.service_request_creator_flow();

-- Preserve event IDs and personal read state for existing request history.
UPDATE public.flow_events e SET activity_recipient_user_id = p.id
FROM public.service_requests s JOIN public.profiles p
  ON p.id = s.created_by AND p.organization_id = s.organization_id
WHERE e.source_table = 'service_requests' AND e.source_id = s.id
  AND e.organization_id = s.organization_id
  AND e.activity_recipient_user_id IS DISTINCT FROM p.id;

UPDATE public.flow_events e SET activity_recipient_user_id = p.id,
  required_module = 'service_requests',
  summary = 'Customer contact activity logged',
  details = 'Open the activity to read the contact method, outcome, and notes.'
FROM public.customer_contact_log l
JOIN public.service_requests s ON s.id = l.service_request_id AND s.organization_id = l.organization_id
JOIN public.profiles p ON p.id = s.created_by AND p.organization_id = s.organization_id
WHERE e.source_table = 'customer_contact_log' AND e.source_id = l.id
  AND e.organization_id = l.organization_id;
