-- Keep the first internal reviewer independently of customer form-open tracking.
ALTER TABLE public.lost_review_details
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.lost_review_details.reviewed_by IS
  'First internal employee to open the submitted response. Legacy reviewed records may have no reviewer.';
