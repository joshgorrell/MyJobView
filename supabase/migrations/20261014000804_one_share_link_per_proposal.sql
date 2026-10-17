ALTER TABLE public.proposal_share_links ADD COLUMN IF NOT EXISTS token_nonce uuid DEFAULT gen_random_uuid() NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS proposal_share_links_one_per_proposal ON public.proposal_share_links(proposal_id);
