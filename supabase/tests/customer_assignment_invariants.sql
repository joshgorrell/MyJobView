-- Read-only rollout audit: every customer must have a valid representative and office.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.customer_assignment_audit) THEN RAISE EXCEPTION 'Invalid customer assignment';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.contacts'::regclass AND conname='contacts_customer_rep_office_required' AND convalidated) THEN RAISE EXCEPTION 'Customer assignment constraint not validated';END IF;
END $$;
SELECT organization_issue,rep_issue,office_issue,count(*) FROM public.customer_assignment_audit GROUP BY organization_issue,rep_issue,office_issue;
