-- Keep delivery preference independent of payment authorization.
-- Existing 'mail' billing-mode accounts represent Admin-approved manual billing;
-- retain their paper delivery when introducing the independent setting.
ALTER TABLE public.security_contracts
  ADD COLUMN IF NOT EXISTS mailed_paper_statements boolean NOT NULL DEFAULT false;

UPDATE public.security_contracts
SET mailed_paper_statements = true
WHERE security_billing_mode = 'mail'
  AND mailed_paper_statements = false;

-- A manual-billing exception must always include paper statements.
-- AutoPay accounts may independently opt into mailed paper statements.
ALTER TABLE public.security_contracts
  ADD CONSTRAINT security_manual_billing_requires_paper
  CHECK (security_billing_mode <> 'mail' OR mailed_paper_statements = true);

COMMENT ON COLUMN public.security_contracts.mailed_paper_statements IS
  'Optional mailed paper statements in addition to always-included electronic statements; independent of AutoPay authorization.';
