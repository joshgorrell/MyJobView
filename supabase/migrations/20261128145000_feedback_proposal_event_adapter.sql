-- Detached adapter: proposal publication, loss, and invalidation.
-- Existing proposal check and lost reminder senders are not changed.
CREATE OR REPLACE FUNCTION public.capture_feedback_proposal_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_status text := NEW.status::text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.organization_id IS NULL OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN RETURN NEW; END IF;
  IF next_status = 'sent' AND NEW.sent_at IS NOT NULL
     AND (OLD.status::text IS DISTINCT FROM 'sent' OR NEW.sent_at IS DISTINCT FROM OLD.sent_at) THEN
    UPDATE public.feedback_timeline_events SET cancelled_at=clock_timestamp(), cancellation_reason='proposal_republished'
      WHERE organization_id=NEW.organization_id AND source_id=NEW.id
        AND timeline_key IN ('proposal_check','lost_opportunity') AND cancelled_at IS NULL;
    INSERT INTO public.feedback_timeline_events
      (organization_id,timeline_key,source_id,occurrence_key,occurred_at)
    VALUES (NEW.organization_id,'proposal_check',NEW.id,
      'published:' || extract(epoch FROM NEW.sent_at)::text,NEW.sent_at)
    ON CONFLICT (organization_id,timeline_key,source_id,occurrence_key) DO NOTHING;
  ELSIF next_status IS DISTINCT FROM OLD.status::text THEN
    IF next_status IN ('approved','approved_pending_action','cancelled','declined','draft') THEN
      UPDATE public.feedback_timeline_events SET cancelled_at=clock_timestamp(), cancellation_reason='proposal_' || next_status
        WHERE organization_id=NEW.organization_id AND source_id=NEW.id
          AND timeline_key='proposal_check' AND cancelled_at IS NULL;
    END IF;
    IF next_status IN ('approved','approved_pending_action','cancelled','draft') THEN
      UPDATE public.feedback_timeline_events SET cancelled_at=clock_timestamp(), cancellation_reason='proposal_' || next_status
        WHERE organization_id=NEW.organization_id AND source_id=NEW.id
          AND timeline_key='lost_opportunity' AND cancelled_at IS NULL;
    END IF;
    IF next_status='declined' AND OLD.status::text IN ('sent','viewed') THEN
      INSERT INTO public.feedback_timeline_events
        (organization_id,timeline_key,source_id,occurrence_key,occurred_at)
      VALUES (NEW.organization_id,'lost_opportunity',NEW.id,gen_random_uuid()::text,clock_timestamp());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_feedback_proposal_transition() FROM PUBLIC, anon, authenticated;
