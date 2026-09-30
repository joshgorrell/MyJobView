-- Independent user permissions: sales can send by default; response access is
-- enabled for admins and explicitly granted for other roles. Existing designated owners
-- retain access until an admin changes their user permission.
ALTER TABLE profiles ADD COLUMN can_send_lost_opportunity_reviews boolean,
 ADD COLUMN can_view_lost_opportunity_submissions boolean,
 ADD COLUMN notify_lost_opportunity_submissions boolean NOT NULL DEFAULT false;
UPDATE profiles p SET
 can_send_lost_opportunity_reviews = role IN ('sales','sales_v2','sales_manager','admin','manager','owner'),
 can_view_lost_opportunity_submissions = role='admin' OR EXISTS(SELECT 1 FROM lost_review_owners o WHERE o.owner_id=p.id AND o.organization_id=p.organization_id);
CREATE FUNCTION guard_lost_review_permissions() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE actor_role text; actor_org uuid;
BEGIN
 NEW.can_send_lost_opportunity_reviews := coalesce(NEW.can_send_lost_opportunity_reviews,NEW.role IN ('sales','sales_v2','sales_manager','admin','manager','owner'));
 NEW.can_view_lost_opportunity_submissions := coalesce(NEW.can_view_lost_opportunity_submissions,NEW.role='admin');
 IF current_user IN ('authenticated','anon') AND ((TG_OP='INSERT' AND (NEW.can_view_lost_opportunity_submissions OR NEW.notify_lost_opportunity_submissions)) OR (TG_OP='UPDATE' AND
 (NEW.can_send_lost_opportunity_reviews IS DISTINCT FROM OLD.can_send_lost_opportunity_reviews OR NEW.can_view_lost_opportunity_submissions IS DISTINCT FROM OLD.can_view_lost_opportunity_submissions OR NEW.notify_lost_opportunity_submissions IS DISTINCT FROM OLD.notify_lost_opportunity_submissions))) THEN
  SELECT role,organization_id INTO actor_role,actor_org FROM profiles WHERE id=auth.uid();
  IF actor_role IS DISTINCT FROM 'admin' OR actor_org IS DISTINCT FROM NEW.organization_id OR (TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
   RAISE EXCEPTION 'Only an administrator in this company can change Lost Opportunity permissions';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_lost_review_permissions() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_lost_review_permissions BEFORE INSERT OR UPDATE ON profiles
 FOR EACH ROW EXECUTE FUNCTION guard_lost_review_permissions();
DROP POLICY lost_response_read ON lost_review_responses;
CREATE POLICY lost_response_read ON lost_review_responses FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM lost_review_details d JOIN profiles p ON p.id=auth.uid()
 WHERE d.request_id=lost_review_responses.request_id AND d.organization_id=p.organization_id
 AND p.is_active AND p.can_view_lost_opportunity_submissions));
DROP POLICY lost_request_delete ON review_requests;
CREATE POLICY lost_request_delete ON review_requests AS RESTRICTIVE FOR DELETE TO authenticated
 USING(request_type='customer_review' OR EXISTS(SELECT 1 FROM profiles p WHERE p.id=auth.uid() AND p.organization_id=review_requests.organization_id AND p.is_active AND p.can_view_lost_opportunity_submissions));
-- Email and in-app notifications also respect Reviews module revocation.
CREATE FUNCTION lost_review_notification_recipients(p_organization_id uuid)
RETURNS TABLE(user_id uuid,email text,full_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT p.id,p.email,p.full_name FROM profiles p
 JOIN department_modules m ON m.module_key='reviews' AND m.is_active
 LEFT JOIN user_permission_overrides o ON o.user_id=p.id AND o.module_id=m.id
 LEFT JOIN role_module_access r ON r.role_id=p.role_id AND r.module_id=m.id
 WHERE p.organization_id=p_organization_id AND p.is_active
 AND p.can_view_lost_opportunity_submissions AND p.notify_lost_opportunity_submissions
 AND CASE WHEN o.override_type='revoke' THEN false WHEN o.override_type='grant' THEN true
 WHEN p.role='admin' THEN true ELSE coalesce(r.has_access,false) END;
$$;
REVOKE ALL ON FUNCTION lost_review_notification_recipients(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION lost_review_notification_recipients(uuid) TO service_role;
CREATE OR REPLACE FUNCTION complete_lost_review_response() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d lost_review_details;
BEGIN
 SELECT * INTO STRICT d FROM lost_review_details WHERE request_id=NEW.request_id;
 UPDATE lost_review_details SET responded_at=NEW.created_at WHERE request_id=NEW.request_id;
 UPDATE review_requests SET review_completed=true WHERE id=NEW.request_id;
 INSERT INTO notifications(user_id,organization_id,type,title,body,related_id)
 SELECT p.user_id,d.organization_id,'review_request','Lost opportunity feedback received',
 'A customer has sent private feedback. Open Reviews → Lost Opportunities to review it.',NEW.request_id
 FROM lost_review_notification_recipients(d.organization_id) p;
 RETURN NEW;
END $$;
-- Keep the legacy owner table and sharing timestamps for upgrade compatibility.
-- Neither owner identity nor shared_at grants access after this migration.
