CREATE TABLE IF NOT EXISTS public.proposal_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  token_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  portal_version integer NOT NULL DEFAULT 1,
  CONSTRAINT proposal_share_links_token_hash_hex CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS proposal_share_links_proposal_idx ON public.proposal_share_links (proposal_id, organization_id) WHERE revoked_at IS NULL;
ALTER TABLE public.proposal_share_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.proposal_share_links FROM anon, authenticated;
COMMENT ON TABLE public.proposal_share_links IS 'Private token hashes for revocable, proposal-scoped customer sharing. No direct browser access; authorization is enforced by dedicated edge functions.';
