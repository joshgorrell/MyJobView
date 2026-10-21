-- Capture contract origin independently from subsequent customer reassignment.
-- A creator who is not a sales rep does not automatically become the originator.
ALTER TABLE public.security_contracts
  ADD COLUMN IF NOT EXISTS originating_sales_rep_id uuid REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.snapshot_security_contract_sales_origin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_owner uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    -- Existing attribution is immutable once recorded.
    NEW.originating_sales_rep_id := OLD.originating_sales_rep_id;
    RETURN NEW;
  END IF;
  SELECT organization_id INTO v_org FROM public.contacts WHERE id=NEW.contact_id;
  IF v_org IS NULL THEN RETURN NEW; END IF;
  SELECT c.assigned_to INTO v_owner FROM public.contacts c
   WHERE c.id=NEW.contact_id AND c.organization_id=v_org;
  IF v_owner IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=v_owner
      AND p.organization_id=v_org AND p.is_sales_rep=true
  ) THEN NEW.originating_sales_rep_id:=v_owner;
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=NEW.created_by_user_id
      AND p.organization_id=v_org AND p.is_sales_rep=true
  ) THEN NEW.originating_sales_rep_id:=NEW.created_by_user_id;
  ELSE NEW.originating_sales_rep_id:=NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_security_contract_sales_origin() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS snapshot_security_contract_sales_origin ON public.security_contracts;
CREATE TRIGGER snapshot_security_contract_sales_origin
BEFORE INSERT OR UPDATE OF originating_sales_rep_id ON public.security_contracts
FOR EACH ROW EXECUTE FUNCTION public.snapshot_security_contract_sales_origin();

-- Existing agreements are not silently attributed from today's customer owner:
-- historical origin requires a reviewed migration/import.
