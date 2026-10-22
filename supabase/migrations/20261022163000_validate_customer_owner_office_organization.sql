-- Enforce organization consistency for customer owner and office, including
-- service-role imports and server-side writes. Legacy rows are checked on update.
CREATE OR REPLACE FUNCTION public.validate_customer_owner_office()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  rep_org uuid;
  office_org uuid;
BEGIN
  IF NEW.contact_type NOT IN ('person', 'business') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_to IS NULL OR NEW.office_id IS NULL OR NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Customers require an assigned sales representative, office, and organization'
      USING ERRCODE = '23514';
  END IF;
  SELECT organization_id INTO rep_org FROM public.profiles WHERE id = NEW.assigned_to;
  SELECT organization_id INTO office_org FROM public.company_offices WHERE id = NEW.office_id;
  IF rep_org IS DISTINCT FROM NEW.organization_id OR office_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Customer representative and office must belong to the customer organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_customer_owner_office_trigger ON public.contacts;
CREATE TRIGGER validate_customer_owner_office_trigger
  BEFORE INSERT OR UPDATE OF contact_type, assigned_to, office_id, organization_id
  ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_customer_owner_office();

-- Before enabling validation of the NOT VALID check constraint, inspect legacy
-- customers and repair assignments manually rather than guessing ownership:
-- SELECT c.id, c.contact_name, c.organization_id, c.assigned_to, c.office_id
-- FROM public.contacts c
-- LEFT JOIN public.profiles p ON p.id = c.assigned_to
-- LEFT JOIN public.company_offices o ON o.id = c.office_id
-- WHERE c.contact_type IN ('person','business')
--   AND (c.assigned_to IS NULL OR c.office_id IS NULL OR
--        p.organization_id IS DISTINCT FROM c.organization_id OR
--        o.organization_id IS DISTINCT FROM c.organization_id);

-- Trigger functions should not be directly callable through the API.
REVOKE ALL ON FUNCTION public.validate_customer_owner_office() FROM PUBLIC, anon, authenticated;
