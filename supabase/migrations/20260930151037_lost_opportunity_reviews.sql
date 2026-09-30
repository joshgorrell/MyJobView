-- Request tracking stays in Reviews. Sensitive responses and access tokens are separate
-- so existing review_requests policies cannot disclose owner-only feedback.
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'customer_review'
  CHECK (request_type IN ('customer_review','lost_opportunity'));
CREATE TABLE lost_review_owners (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),
 owner_id uuid NOT NULL REFERENCES profiles(id)
);
CREATE TABLE lost_review_details (
 request_id uuid PRIMARY KEY REFERENCES review_requests(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 proposal_id uuid REFERENCES proposals(id),
 opportunity_name text NOT NULL CHECK(length(opportunity_name) BETWEEN 1 AND 200),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),
 delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','sent','failed')),
 responded_at timestamptz,
 reviewed_at timestamptz,
 shared_at timestamptz,
 recovery_outcome text NOT NULL DEFAULT 'unreviewed' CHECK(recovery_outcome IN ('unreviewed','following_up','recovered','closed'))
);
CREATE TABLE lost_review_tokens (
 request_id uuid PRIMARY KEY REFERENCES lost_review_details(request_id) ON DELETE CASCADE,
 token_hash text UNIQUE NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days'
);
CREATE TABLE lost_review_responses (
 request_id uuid PRIMARY KEY REFERENCES lost_review_details(request_id) ON DELETE CASCADE,
 reasons text[] NOT NULL DEFAULT '{}',
 message text NOT NULL DEFAULT '' CHECK(length(message)<=10000),
 recoverable text NOT NULL CHECK(recoverable IN ('yes','maybe','no')),
 recovery_message text NOT NULL DEFAULT '' CHECK(length(recovery_message)<=10000),
 attachments jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(cardinality(reasons)>0 OR length(trim(message))>0)
);
ALTER TABLE lost_review_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE lost_review_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE lost_review_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE lost_review_responses ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON lost_review_owners,lost_review_details,lost_review_responses TO authenticated;
GRANT ALL ON lost_review_owners,lost_review_details,lost_review_tokens,lost_review_responses TO service_role;
CREATE POLICY lost_owner_read ON lost_review_owners FOR SELECT TO authenticated
 USING(organization_id = get_user_org_id());
CREATE POLICY lost_details_read ON lost_review_details FOR SELECT TO authenticated
 USING(organization_id = get_user_org_id());
CREATE POLICY lost_response_read ON lost_review_responses FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM lost_review_details d JOIN lost_review_owners o USING(organization_id)
 WHERE d.request_id=lost_review_responses.request_id AND d.organization_id=get_user_org_id()
 AND (o.owner_id=auth.uid() OR d.shared_at IS NOT NULL)));
-- No direct writes, anonymous reads, or token access. The edge endpoint checks
-- organization membership, owner identity, references and token expiry on each action.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('lost-review-bids','lost-review-bids',false,10485760,ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
 ON CONFLICT(id) DO NOTHING;
CREATE INDEX lost_review_details_org ON lost_review_details(organization_id);

-- Defense against projects with automatic default grants enabled.
REVOKE ALL ON lost_review_owners,lost_review_details,lost_review_tokens,lost_review_responses FROM anon,authenticated;
GRANT SELECT ON lost_review_owners,lost_review_details,lost_review_responses TO authenticated;
CREATE POLICY lost_owner_module ON lost_review_owners AS RESTRICTIVE FOR SELECT TO authenticated USING(flow_has_module_access('reviews'));
CREATE POLICY lost_details_module ON lost_review_details AS RESTRICTIVE FOR SELECT TO authenticated USING(flow_has_module_access('reviews'));
CREATE POLICY lost_response_module ON lost_review_responses AS RESTRICTIVE FOR SELECT TO authenticated USING(flow_has_module_access('reviews'));
-- Generic review request permissions must not allow senders to erase private feedback.
CREATE POLICY lost_request_delete ON review_requests AS RESTRICTIVE FOR DELETE TO authenticated
 USING(request_type='customer_review' OR EXISTS(SELECT 1 FROM lost_review_owners o WHERE o.organization_id=review_requests.organization_id AND o.owner_id=auth.uid()));
CREATE POLICY lost_request_update ON review_requests AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(request_type='customer_review') WITH CHECK(request_type='customer_review');
CREATE POLICY lost_request_insert ON review_requests AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(request_type='customer_review');

-- Atomically complete request tracking and notify only the designated owner.
-- Trigger runs as the service caller; it needs no SECURITY DEFINER privileges.
CREATE FUNCTION complete_lost_review_response() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d lost_review_details; owner_uuid uuid;
BEGIN
 SELECT * INTO STRICT d FROM lost_review_details WHERE request_id=NEW.request_id;
 SELECT owner_id INTO STRICT owner_uuid FROM lost_review_owners WHERE organization_id=d.organization_id;
 UPDATE lost_review_details SET responded_at=NEW.created_at WHERE request_id=NEW.request_id;
 UPDATE review_requests SET review_completed=true WHERE id=NEW.request_id;
 INSERT INTO notifications(user_id,organization_id,type,title,body,related_id)
 VALUES(owner_uuid,d.organization_id,'review_request','Lost opportunity feedback received',
   'A customer has sent private feedback. Open Reviews → Lost Opportunities to review it.',NEW.request_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION complete_lost_review_response() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER complete_lost_review_response AFTER INSERT ON lost_review_responses
 FOR EACH ROW EXECUTE FUNCTION complete_lost_review_response();
-- Existing broad storage policies cannot grant employee/anonymous access to these
-- private bids. All uploads and signed downloads go through the checked endpoint.
CREATE POLICY lost_bid_edge_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING(bucket_id <> 'lost-review-bids') WITH CHECK(bucket_id <> 'lost-review-bids');
