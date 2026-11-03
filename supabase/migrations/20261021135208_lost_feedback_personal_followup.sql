-- Customer-confirmed feedback may arrive in person long after the original loss.
ALTER TABLE public.proposal_loss_feedback DROP CONSTRAINT proposal_loss_feedback_source_check;
ALTER TABLE public.proposal_loss_feedback ADD CONSTRAINT proposal_loss_feedback_source_check CHECK(source IN ('phone','email','in_person','staff_assessment'));
ALTER TABLE public.lost_review_responses DROP CONSTRAINT lost_review_responses_source_check;
ALTER TABLE public.lost_review_responses ADD CONSTRAINT lost_review_responses_source_check CHECK(source IN ('customer','phone','email','in_person'));
ALTER TABLE public.lost_review_details ADD COLUMN manual_resend_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.company_settings ALTER COLUMN lost_review_followup_days SET DEFAULT 14;
-- Apply the agreed schedule to EL; preserve other dealers' configured delays.
UPDATE public.company_settings SET lost_review_followup_days=14
 WHERE organization_id IN (SELECT id FROM public.organizations WHERE subdomain='elife');
