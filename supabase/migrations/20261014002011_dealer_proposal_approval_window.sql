ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS proposal_approval_days integer NOT NULL DEFAULT 30 CHECK (proposal_approval_days BETWEEN 1 AND 365);
COMMENT ON COLUMN public.organizations.proposal_approval_days IS 'Dealer-configured approval and shared-link viewing window in days; applied when a proposal is submitted.';
