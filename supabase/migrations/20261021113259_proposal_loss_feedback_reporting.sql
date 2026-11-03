-- Preserve the outcome when archived; archives must not erase loss statistics.
ALTER TABLE public.proposals ADD COLUMN archived_loss_status text CHECK(archived_loss_status IN ('declined','cancelled'));
UPDATE public.proposals SET archived_loss_status=CASE
 WHEN decline_reason IN ('duplicate','error','replaced_by_revision','customer_request') THEN 'cancelled'
 WHEN auto_archived OR declined_at IS NOT NULL OR decline_reason IS NOT NULL THEN 'declined' END WHERE status='archived';
CREATE FUNCTION public.preserve_archived_loss_status() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.status='archived' AND OLD.status IN ('declined','cancelled') THEN NEW.archived_loss_status=OLD.status;
 ELSIF NEW.status<>'archived' THEN NEW.archived_loss_status=NULL; END IF;
 IF NEW.status IN ('declined','cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.declined_at IS NOT DISTINCT FROM OLD.declined_at AND OLD.status<>'archived' THEN NEW.declined_at=now();
  ELSE NEW.declined_at=coalesce(NEW.declined_at,now()); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.preserve_archived_loss_status() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER preserve_archived_loss_status BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.preserve_archived_loss_status();

-- Immutable staff follow-up history; recorder and timestamp are database supplied.
CREATE TABLE public.proposal_loss_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
 source text NOT NULL CHECK(source IN ('phone','email','staff_assessment')),
 reasons text[] NOT NULL CHECK(cardinality(reasons) BETWEEN 1 AND 16 AND reasons <@ ARRAY[
 'price_too_high','went_with_competitor','project_cancelled','no_response','timing','budget_cut',
 'scope_change','changed_mind','dont_want_rep','dont_want_company','value','equipment','communication','process','other','unknown']),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=10000),
 recorded_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(source='staff_assessment' OR NOT reasons && ARRAY['no_response','unknown'])
);
CREATE INDEX proposal_loss_feedback_proposal ON public.proposal_loss_feedback(organization_id,proposal_id,created_at DESC);
ALTER TABLE public.proposal_loss_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.proposal_loss_feedback FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.proposal_loss_feedback TO authenticated;
GRANT INSERT (organization_id,proposal_id,source,reasons,notes) ON public.proposal_loss_feedback TO authenticated;
GRANT ALL ON public.proposal_loss_feedback TO service_role;
CREATE POLICY loss_feedback_read ON public.proposal_loss_feedback FOR SELECT TO authenticated USING (
 organization_id=public.get_user_org_id() AND public.flow_has_module_access('proposals')
 AND EXISTS(SELECT 1 FROM public.profiles actor JOIN public.proposals p ON p.id=proposal_id
 WHERE actor.id=auth.uid() AND actor.is_active AND actor.organization_id=proposal_loss_feedback.organization_id
 AND p.organization_id=actor.organization_id AND (p.created_by=actor.id OR actor.role IN ('admin','owner','super_admin','manager','sales_manager','finance')))
);
CREATE POLICY loss_feedback_insert ON public.proposal_loss_feedback FOR INSERT TO authenticated WITH CHECK (
 recorded_by=auth.uid() AND organization_id=public.get_user_org_id() AND public.flow_has_module_access('proposals')
 AND EXISTS(SELECT 1 FROM public.profiles actor JOIN public.proposals p ON p.id=proposal_id
 WHERE actor.id=auth.uid() AND actor.is_active AND actor.organization_id=proposal_loss_feedback.organization_id
 AND p.organization_id=actor.organization_id AND (p.status='declined' OR (p.status='archived' AND p.archived_loss_status='declined'))
 AND (p.created_by=actor.id OR actor.role IN ('admin','owner','super_admin','manager','sales_manager')))
);
CREATE FUNCTION public.record_proposal_decline(p_proposal_id uuid,p_reason text,p_notes text,p_source text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_id uuid; v_org uuid; v_feedback_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.flow_has_module_access('proposals') THEN RAISE EXCEPTION 'Proposal access required'; END IF;
 SELECT p.id,p.organization_id INTO v_id,v_org FROM public.proposals p JOIN public.profiles actor ON actor.id=auth.uid()
 WHERE p.id=p_proposal_id AND actor.is_active AND p.organization_id=actor.organization_id
 AND p.status NOT IN ('approved','approved_pending_action','cancelled','archived')
 AND (p.created_by=actor.id OR actor.role IN ('admin','owner','super_admin','manager','sales_manager')) FOR UPDATE OF p;
 IF v_id IS NULL THEN RAISE EXCEPTION 'This proposal is not available for decline'; END IF;
 UPDATE public.proposals SET status='declined',decline_reason=p_reason,decline_notes=nullif(trim(p_notes),''),declined_by='rep',declined_at=coalesce(declined_at,now()) WHERE id=v_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unable to decline this proposal'; END IF;
 INSERT INTO public.proposal_loss_feedback(organization_id,proposal_id,source,reasons,notes)
 VALUES(v_org,v_id,p_source,ARRAY[p_reason],coalesce(trim(p_notes),'')) RETURNING id INTO v_feedback_id;
 RETURN v_feedback_id;
END $$;
REVOKE ALL ON FUNCTION public.record_proposal_decline(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_proposal_decline(uuid,text,text,text) TO authenticated;

-- The reminder link must not invalidate the original invitation.
ALTER TABLE public.lost_review_tokens ADD COLUMN followup_token_hash text UNIQUE;
ALTER TABLE public.lost_review_details ADD COLUMN followup_claimed_at timestamptz;
ALTER TABLE public.lost_review_responses ADD COLUMN source text NOT NULL DEFAULT 'customer' CHECK(source IN ('customer','phone','email')),
 ADD COLUMN recorded_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.company_settings ADD COLUMN lost_review_followup_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN lost_review_followup_days integer NOT NULL DEFAULT 7 CHECK(lost_review_followup_days BETWEEN 1 AND 90);
UPDATE public.company_settings SET lost_review_followup_enabled=auto_review_followup_enabled;
-- Enable only Electronic Life's lost-feedback reminder; other email settings are unchanged.
UPDATE public.company_settings SET lost_review_followup_enabled=true,lost_review_followup_days=7
 WHERE organization_id IN (SELECT id FROM public.organizations WHERE subdomain='elife');
