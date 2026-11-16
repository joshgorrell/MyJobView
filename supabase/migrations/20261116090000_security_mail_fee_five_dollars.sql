-- New mailed-invoice enrollments cost $5/month. Existing $7 agreements retain their
-- accepted fee and invoice history; this migration does not reprice signed accounts.
ALTER TABLE public.security_contracts
  DROP CONSTRAINT IF EXISTS security_contracts_mail_invoice_fee_check;
ALTER TABLE public.security_contracts
  ADD CONSTRAINT security_contracts_mail_invoice_fee_check
  CHECK (mail_invoice_fee IN (0, 5, 7));

-- Preserve all other existing security-billing trigger logic. Refuse to deploy
-- if its expected fee expressions have changed, rather than silently replacing
-- a newer version of the trigger with an obsolete implementation.
DO $migration$
DECLARE
  original_definition text;
  updated_definition text;
BEGIN
  SELECT pg_get_functiondef('private.enforce_security_billing()'::regprocedure)
    INTO original_definition;
  IF original_definition NOT LIKE '%THEN 7 ELSE 0 END - v_old_fee%'
     OR original_definition NOT LIKE '%THEN 7 ELSE 0 END;%'
  THEN
    RAISE EXCEPTION 'Security billing trigger changed; review the $5 mailing fee migration before applying';
  END IF;
  updated_definition := replace(original_definition,
    'THEN 7 ELSE 0 END - v_old_fee',
    'THEN 5 ELSE 0 END - v_old_fee');
  updated_definition := replace(updated_definition,
    'THEN 7 ELSE 0 END;',
    'THEN 5 ELSE 0 END;');
  -- Preserve previously accepted $7 fees when the billing mode is unchanged.
  updated_definition := replace(updated_definition,
    'NEW.mail_invoice_fee := CASE WHEN NEW.security_billing_mode=''mail'' THEN 5 ELSE 0 END;',
    'NEW.mail_invoice_fee := CASE WHEN NEW.security_billing_mode=''mail'' THEN CASE WHEN TG_OP=''UPDATE'' AND NOT v_changed AND OLD.mail_invoice_fee=7 THEN 7 ELSE 5 END ELSE 0 END;');
  EXECUTE updated_definition;
END
$migration$;
