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

-- Until a token-scoped onboarding RPC implements customer choice, only an
-- authenticated organization Admin may change this preference. This blocks
-- ordinary sales/staff writes from silently adding recurring paper charges.
CREATE OR REPLACE FUNCTION private.enforce_security_paper_statement_authorization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.mailed_paper_statements IS DISTINCT FROM OLD.mailed_paper_statements THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND organization_id = NEW.organization_id AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Only an Admin may change mailed paper statements'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.customer_completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Update statement delivery before signing and send a new agreement';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_security_paper_statement_authorization() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_security_paper_statement_authorization ON public.security_contracts;
CREATE TRIGGER enforce_security_paper_statement_authorization
  BEFORE UPDATE ON public.security_contracts
  FOR EACH ROW EXECUTE FUNCTION private.enforce_security_paper_statement_authorization();

-- Persist only a strict boolean customer preference in the private draft.
-- This does not authorize charges or alter a signed contract: the signing RPC
-- must separately validate and apply the preference before enabling the UI.
CREATE OR REPLACE FUNCTION private.security_safe_draft(p_form jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'personalInfo', jsonb_build_object(
      'full_name', left(coalesce(p_form->'personalInfo'->>'full_name', ''), 200),
      'email', left(coalesce(p_form->'personalInfo'->>'email', ''), 254),
      'phone', left(coalesce(p_form->'personalInfo'->>'phone', ''), 40)),
    'propertyInfo', jsonb_build_object(
      'address_line1', left(coalesce(p_form->'propertyInfo'->>'address_line1', ''), 300),
      'city', left(coalesce(p_form->'propertyInfo'->>'city', ''), 100),
      'state', left(coalesce(p_form->'propertyInfo'->>'state', ''), 2),
      'zip_code', left(coalesce(p_form->'propertyInfo'->>'zip_code', ''), 20)),
    'emergencyContacts', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'name', left(coalesce(e->>'name', ''), 200),
      'phone', left(coalesce(e->>'phone', ''), 40),
      'password', left(coalesce(e->>'password', ''), 100),
      'canAuthorize', coalesce(e->>'canAuthorize', 'false') = 'true') ORDER BY ord)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_form->'emergencyContacts') = 'array'
        THEN p_form->'emergencyContacts' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(e,ord)
      WHERE ord <= 10), '[]'::jsonb),
    'paymentMethodId', CASE WHEN coalesce(p_form->>'paymentMethodId','') ~ '^[0-9a-fA-F-]{36}$' THEN p_form->>'paymentMethodId' ELSE '' END,
    'paymentMethod', CASE WHEN p_form->>'paymentMethod' IN ('credit_card','ach')
      THEN p_form->>'paymentMethod' ELSE '' END,
    'billingPreference', CASE WHEN p_form->>'billingPreference' = 'annual' THEN 'annual' ELSE 'monthly' END,
    'mailedPaperStatements', CASE WHEN jsonb_typeof(p_form->'mailedPaperStatements') = 'boolean' THEN (p_form->>'mailedPaperStatements')::boolean ELSE false END
  );
$$;
REVOKE ALL ON FUNCTION private.security_safe_draft(jsonb) FROM PUBLIC, anon, authenticated;
