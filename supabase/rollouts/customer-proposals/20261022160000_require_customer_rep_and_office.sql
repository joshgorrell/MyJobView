-- Existing missing representatives were explicitly assigned by the owner before
-- rollout. Fail rather than create any exception for an unassigned customer.
ALTER TABLE public.contacts ADD CONSTRAINT contacts_customer_rep_office_required
 CHECK(contact_type IS NOT NULL AND (contact_type IN ('lead','prospect') OR
 (contact_type IN ('person','business') AND assigned_to IS NOT NULL AND office_id IS NOT NULL)));
