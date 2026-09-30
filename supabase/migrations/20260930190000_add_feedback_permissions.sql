-- Granular Feedback permissions.
-- Google review asking is intentionally broad by default; sensitive feedback remains restricted.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_request_google_reviews boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_customer_feedback boolean,
  ADD COLUMN IF NOT EXISTS can_manage_customer_feedback boolean;

UPDATE profiles
SET
  can_view_customer_feedback = COALESCE(
    can_view_customer_feedback,
    role IN ('admin','owner','manager','sales_manager','service_manager','production_manager')
  ),
  can_manage_customer_feedback = COALESCE(
    can_manage_customer_feedback,
    role IN ('admin','owner','manager')
  );

ALTER TABLE profiles
  ALTER COLUMN can_view_customer_feedback SET DEFAULT false,
  ALTER COLUMN can_view_customer_feedback SET NOT NULL,
  ALTER COLUMN can_manage_customer_feedback SET DEFAULT false,
  ALTER COLUMN can_manage_customer_feedback SET NOT NULL;

CREATE OR REPLACE FUNCTION guard_feedback_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  actor_role text;
  actor_org uuid;
BEGIN
  IF current_user IN ('authenticated','anon') AND TG_OP = 'UPDATE' AND (
    NEW.can_request_google_reviews IS DISTINCT FROM OLD.can_request_google_reviews OR
    NEW.can_view_customer_feedback IS DISTINCT FROM OLD.can_view_customer_feedback OR
    NEW.can_manage_customer_feedback IS DISTINCT FROM OLD.can_manage_customer_feedback
  ) THEN
    SELECT role, organization_id INTO actor_role, actor_org
    FROM profiles WHERE id = auth.uid();

    IF actor_role IS DISTINCT FROM 'admin'
       OR actor_org IS DISTINCT FROM NEW.organization_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Only an administrator in this company can change Feedback permissions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION guard_feedback_permissions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_feedback_permissions ON profiles;
CREATE TRIGGER guard_feedback_permissions
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION guard_feedback_permissions();

COMMENT ON COLUMN profiles.can_request_google_reviews IS
  'May display the Google review QR and send direct Google review requests. Does not grant access to customer feedback.';
COMMENT ON COLUMN profiles.can_view_customer_feedback IS
  'May view customer feedback dashboards, responses, and history.';
COMMENT ON COLUMN profiles.can_manage_customer_feedback IS
  'May manage customer feedback programs, follow-up state, and administrative actions.';
