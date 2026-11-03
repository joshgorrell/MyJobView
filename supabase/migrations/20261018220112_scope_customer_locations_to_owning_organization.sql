/*
# Scope customer_locations access to the owning organization

1. Problem
   - The four "Authenticated users can ..." policies used the predicate `true`, so any
     signed-in user could read, change or delete every customer site address, phone
     number and access instruction in every organization.

2. Changes
   - Replaces the four policies with equivalents scoped through the owning contact:
     the related `contacts` row must belong to the caller's organization.

3. Notes
   1. `customer_locations` has no `organization_id` column of its own, so the scope is
      derived from `contacts.organization_id`.
   2. Staff keep full access to their own organization's locations, so no feature
      changes for legitimate users.
   3. No data is modified or removed.
*/

DROP POLICY IF EXISTS "Authenticated users can view customer locations" ON public.customer_locations;
DROP POLICY IF EXISTS "Authenticated users can add customer locations" ON public.customer_locations;
DROP POLICY IF EXISTS "Authenticated users can update customer locations" ON public.customer_locations;
DROP POLICY IF EXISTS "Authenticated users can delete customer locations" ON public.customer_locations;

CREATE POLICY "customer_locations_select_same_org"
  ON public.customer_locations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = customer_locations.customer_contact_id
      AND c.organization_id = get_user_org_id()
  ));

CREATE POLICY "customer_locations_insert_same_org"
  ON public.customer_locations FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = customer_locations.customer_contact_id
      AND c.organization_id = get_user_org_id()
  ));

CREATE POLICY "customer_locations_update_same_org"
  ON public.customer_locations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = customer_locations.customer_contact_id
      AND c.organization_id = get_user_org_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = customer_locations.customer_contact_id
      AND c.organization_id = get_user_org_id()
  ));

CREATE POLICY "customer_locations_delete_same_org"
  ON public.customer_locations FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = customer_locations.customer_contact_id
      AND c.organization_id = get_user_org_id()
  ));