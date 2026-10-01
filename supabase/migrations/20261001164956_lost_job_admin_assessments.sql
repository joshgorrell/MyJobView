CREATE TABLE public.lost_review_assessments (
 request_id uuid PRIMARY KEY REFERENCES public.lost_review_details(request_id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 sales_rep_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 primary_reason text NOT NULL CHECK (primary_reason IN ('lowest_price','budget_mismatch','value_not_understood','personal_attention','discovery_walkthrough','proposal_clarity','follow_through','solution_fit','competitor_relationship','timing_cancelled','other','unknown')),
 contributing_reasons text[] NOT NULL DEFAULT '{}' CHECK (contributing_reasons <@ ARRAY['lowest_price','budget_mismatch','value_not_understood','personal_attention','discovery_walkthrough','proposal_clarity','follow_through','solution_fit','competitor_relationship','timing_cancelled','other','unknown']::text[]),
 discovery_rating smallint CHECK (discovery_rating BETWEEN 1 AND 5),
 attention_rating smallint CHECK (attention_rating BETWEEN 1 AND 5),
 explanation_rating smallint CHECK (explanation_rating BETWEEN 1 AND 5),
 communication_rating smallint CHECK (communication_rating BETWEEN 1 AND 5),
 value_rating smallint CHECK (value_rating BETWEEN 1 AND 5),
 preventability text NOT NULL CHECK (preventability IN ('yes','possibly','no','unknown')),
 strengths text NOT NULL DEFAULT '' CHECK (length(strengths)<=10000),
 improvements text NOT NULL DEFAULT '' CHECK (length(improvements)<=10000),
 findings text NOT NULL DEFAULT '' CHECK (length(findings)<=10000),
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lost_review_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lost_review_assessments FROM anon,authenticated;
GRANT SELECT ON public.lost_review_assessments TO authenticated;
GRANT ALL ON public.lost_review_assessments TO service_role;
CREATE POLICY lost_assessment_admin_read ON public.lost_review_assessments FOR SELECT TO authenticated USING (
 flow_has_module_access('reviews') AND EXISTS (SELECT 1 FROM public.profiles p
 WHERE p.id=auth.uid() AND p.organization_id=lost_review_assessments.organization_id
 AND p.role='admin' AND p.is_active AND p.can_view_lost_opportunity_submissions)
);
COMMENT ON TABLE public.lost_review_assessments IS 'Private admin sales assessment, separate from customer feedback. Writes use the authenticated Lost Opportunity endpoint.';
