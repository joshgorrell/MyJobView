-- Customers (person/business) must have both an assigned representative and office.
-- Leads and prospects may remain unassigned during intake.
-- NOT VALID protects existing legacy rows while enforcing all new inserts and updates.
-- Validate only after reviewing and repairing the existing customer population.
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_customer_rep_office_required
  CHECK (
    contact_type IS NOT NULL AND (
      contact_type IN ('lead', 'prospect')
      OR (contact_type IN ('person', 'business') AND assigned_to IS NOT NULL AND office_id IS NOT NULL)
    )
  ) NOT VALID;

-- A safe, read-only audit for administrators before validation:
-- SELECT id, contact_name, contact_type, assigned_to, office_id
-- FROM public.contacts
-- WHERE contact_type IN ('person', 'business')
--   AND (assigned_to IS NULL OR office_id IS NULL);
-- After remediation:
-- ALTER TABLE public.contacts VALIDATE CONSTRAINT contacts_customer_rep_office_required;
