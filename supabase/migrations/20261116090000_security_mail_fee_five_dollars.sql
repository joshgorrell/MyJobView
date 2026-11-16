-- All security accounts are new to MJV: standardize the mailed-invoice fee
-- to $5/month. No historical $7 account grandfathering is necessary.
ALTER TABLE public.security_contracts
  DROP CONSTRAINT IF EXISTS security_contracts_mail_invoice_fee_check;
ALTER TABLE public.security_contracts
  ADD CONSTRAINT security_contracts_mail_invoice_fee_check
  CHECK (mail_invoice_fee IN (0, 5));

-- Preserve existing security authorization and signing safeguards.
-- Fail closed if the billing trigger differs from the audited implementation.
DO $migration$
DECLARE original_definition text; updated_definition text;
BEGIN
  SELECT pg_get_functiondef('private.enforce_security_billing()'::regprocedure)
    INTO original_definition;
  IF original_definition NOT LIKE '%THEN 7 ELSE 0 END - v_old_fee%'
     OR original_definition NOT LIKE '%THEN 7 ELSE 0 END;%'
  THEN
    RAISE EXCEPTION 'Security billing trigger changed; review fee migration before applying';
  END IF;
  updated_definition := replace(original_definition,
    'THEN 7 ELSE 0 END - v_old_fee',
    'THEN 5 ELSE 0 END - v_old_fee');
  updated_definition := replace(updated_definition,
    'THEN 7 ELSE 0 END;',
    'THEN 5 ELSE 0 END;');
  EXECUTE updated_definition;
END
$migration$;
