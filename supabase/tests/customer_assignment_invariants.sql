-- Run against a disposable database with the customer-assignment migrations applied.
-- This is a read-only audit: failures signal invalid customer ownership.
DO $$
DECLARE broken_count bigint;
BEGIN
  SELECT count(*) INTO broken_count
  FROM public.contacts c
  LEFT JOIN public.profiles p ON p.id = c.assigned_to
  LEFT JOIN public.company_offices o ON o.id = c.office_id
  WHERE c.contact_type IN ('person', 'business')
    AND (c.assigned_to IS NULL OR c.office_id IS NULL OR
         p.organization_id IS DISTINCT FROM c.organization_id OR
         o.organization_id IS DISTINCT FROM c.organization_id);
  IF broken_count > 0 THEN
    RAISE EXCEPTION '% customers have missing or invalid representative/office assignments; remediation required', broken_count;
  END IF;
END $$;

-- Check the constraint was installed and validated before declaring rollout complete.
SELECT conname, convalidated
FROM pg_constraint
WHERE conrelid = 'public.contacts'::regclass
  AND conname = 'contacts_customer_rep_office_required';
