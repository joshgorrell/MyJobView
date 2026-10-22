-- Read-only administrator audit for customer ownership before validation.
-- No records are reassigned automatically.
CREATE OR REPLACE VIEW public.customer_assignment_audit
WITH (security_invoker = true)
AS
SELECT c.id AS contact_id,
       c.organization_id,
       c.contact_type,
       c.assigned_to AS assigned_rep_id,
       c.office_id,
       CASE
         WHEN c.assigned_to IS NULL THEN 'missing_rep'
         WHEN p.id IS NULL THEN 'rep_not_found'
         WHEN p.organization_id IS DISTINCT FROM c.organization_id THEN 'rep_wrong_organization'
         ELSE NULL
       END AS rep_issue,
       CASE
         WHEN c.office_id IS NULL THEN 'missing_office'
         WHEN o.id IS NULL THEN 'office_not_found'
         WHEN o.organization_id IS DISTINCT FROM c.organization_id THEN 'office_wrong_organization'
         ELSE NULL
       END AS office_issue
FROM public.contacts c
LEFT JOIN public.profiles p ON p.id = c.assigned_to
LEFT JOIN public.company_offices o ON o.id = c.office_id
WHERE c.contact_type IN ('person', 'business')
  AND (c.assigned_to IS NULL OR c.office_id IS NULL
       OR p.organization_id IS DISTINCT FROM c.organization_id
       OR o.organization_id IS DISTINCT FROM c.organization_id);

-- This is an internal audit, not a customer-facing API endpoint.
REVOKE ALL ON public.customer_assignment_audit FROM PUBLIC, anon, authenticated;
-- The view uses invoker security; only privileged database operators should query it.
-- Run as database administrator:
-- SELECT rep_issue, office_issue, count(*) FROM public.customer_assignment_audit
-- GROUP BY rep_issue, office_issue ORDER BY count(*) DESC;
-- Once the view returns zero rows:
-- ALTER TABLE public.contacts VALIDATE CONSTRAINT contacts_customer_rep_office_required;
