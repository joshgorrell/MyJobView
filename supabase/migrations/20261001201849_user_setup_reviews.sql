-- Administrative review metadata only. It never grants permissions or payroll approval.
CREATE TABLE public.user_setup_reviews (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_sections text[] NOT NULL DEFAULT '{}',
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_setup_reviews_sections CHECK (
    reviewed_sections <@ ARRAY['profile','access','permissions','notifications','pay','sales']::text[]
  )
);
ALTER TABLE public.user_setup_reviews ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_setup_reviews TO authenticated;
CREATE POLICY user_setup_reviews_admin ON public.user_setup_reviews
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles actor JOIN public.profiles target
    ON actor.organization_id = target.organization_id
  WHERE actor.id = auth.uid() AND actor.role = 'admin' AND actor.is_active
    AND target.id = user_setup_reviews.user_id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.profiles actor JOIN public.profiles target
    ON actor.organization_id = target.organization_id
  WHERE actor.id = auth.uid() AND actor.role = 'admin' AND actor.is_active
    AND target.id = user_setup_reviews.user_id
));
