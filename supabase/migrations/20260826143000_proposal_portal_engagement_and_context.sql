-- Preserve which published portal version a customer was looking at when
-- they viewed/downloaded a proposal or asked a question.
-- Existing proposal-level Q&A threads remain intact across offline edits.

ALTER TABLE IF EXISTS public.messages
  ADD COLUMN IF NOT EXISTS portal_version_number integer;

ALTER TABLE IF EXISTS public.proposal_activity
  ADD COLUMN IF NOT EXISTS portal_version_number integer;

CREATE OR REPLACE FUNCTION public.stamp_message_proposal_portal_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
  v_version integer;
BEGIN
  IF NEW.portal_version_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT mt.proposal_id
    INTO v_proposal_id
  FROM public.message_threads mt
  WHERE mt.id = NEW.thread_id;

  IF v_proposal_id IS NOT NULL THEN
    SELECT COALESCE(p.current_portal_version, 0)
      INTO v_version
    FROM public.proposals p
    WHERE p.id = v_proposal_id;

    NEW.portal_version_number := NULLIF(v_version, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_message_proposal_portal_version ON public.messages;
CREATE TRIGGER trg_stamp_message_proposal_portal_version
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.stamp_message_proposal_portal_version();

CREATE OR REPLACE FUNCTION public.stamp_proposal_activity_portal_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
BEGIN
  IF NEW.portal_version_number IS NOT NULL OR NEW.proposal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.current_portal_version, 0)
    INTO v_version
  FROM public.proposals p
  WHERE p.id = NEW.proposal_id;

  NEW.portal_version_number := NULLIF(v_version, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_proposal_activity_portal_version ON public.proposal_activity;
CREATE TRIGGER trg_stamp_proposal_activity_portal_version
BEFORE INSERT ON public.proposal_activity
FOR EACH ROW
EXECUTE FUNCTION public.stamp_proposal_activity_portal_version();

CREATE INDEX IF NOT EXISTS idx_messages_portal_version_number
  ON public.messages (portal_version_number)
  WHERE portal_version_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposal_activity_proposal_version
  ON public.proposal_activity (proposal_id, portal_version_number, created_at DESC);

COMMENT ON COLUMN public.messages.portal_version_number IS
  'Published proposal portal version visible when this Q&A message was created. Conversation remains tied to proposal/thread across revisions.';

COMMENT ON COLUMN public.proposal_activity.portal_version_number IS
  'Published proposal portal version visible when this customer activity occurred.';
