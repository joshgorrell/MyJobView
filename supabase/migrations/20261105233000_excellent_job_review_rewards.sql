-- Award review points only when a job-completion survey first receives Excellent.
-- Keep rewards disabled until administrators enable them; no historical backfill.
CREATE OR REPLACE FUNCTION private.award_excellent_job_review_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_points integer;
  v_recipient uuid;
BEGIN
  IF NEW.survey_type IS DISTINCT FROM 'job_completion'
     OR NEW.rating IS DISTINCT FROM 'excellent'
     OR NEW.responded_at IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.responded_at IS NOT NULL)
  THEN
    RETURN NEW;
  END IF;

  SELECT s.review_points INTO v_points
  FROM public.employee_action_reward_settings s
  WHERE s.organization_id = NEW.organization_id
    AND s.enabled IS TRUE
    AND NEW.responded_at >= s.started_at;

  IF coalesce(v_points, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- UNION removes a duplicate when the sales rep is also the lead tech.
  FOR v_recipient IN
    SELECT recipient FROM (
      SELECT NEW.sales_rep_id AS recipient
      UNION
      SELECT NEW.lead_tech_id AS recipient
    ) recipients
    WHERE recipient IS NOT NULL
  LOOP
    -- Skip deleted or cross-organization employees.
    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_recipient AND p.organization_id = NEW.organization_id
    ) THEN
      PERFORM private.post_reward_points(
        NEW.organization_id, v_recipient, v_points,
        'job_review', NEW.id, 'Excellent Job Review',
        'excellent_job_review:' || NEW.id::text || ':' || v_recipient::text
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.award_excellent_job_review_points() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_award_excellent_job_review_points ON public.customer_satisfaction;
CREATE TRIGGER trg_award_excellent_job_review_points
AFTER INSERT OR UPDATE OF rating, responded_at ON public.customer_satisfaction
FOR EACH ROW EXECUTE FUNCTION private.award_excellent_job_review_points();
