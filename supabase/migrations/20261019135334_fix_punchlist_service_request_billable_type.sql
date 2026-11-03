/*
# Fix request_punchlist_service: use 'billable' instead of NULL

## Summary

The previous corrective migration changed `request_punchlist_service` to set
`billable_type` to NULL instead of 'warranty'. However, the `service_requests`
table has a NOT NULL constraint on `billable_type` and `billable_by`. This
updates the function to use 'billable' as the default, which is the correct
default for service requests that are not automatically classified as warranty.

## What This Fixes

- `billable_type` is now set to 'billable' (not NULL, not 'warranty')
- `billable_by` is now set to 'admin' (not NULL) since the request originates
  from the punchlist system and needs a valid billable_by value

## Functions Modified
- public.request_punchlist_service — billable_type='billable', billable_by='admin'

## Important Notes
- The dispatch team can change the billing type when creating the work order.
- 'billable' is the correct default since warranty should be an explicit decision,
  not an automatic classification for all punchlist service requests.
*/

CREATE OR REPLACE FUNCTION public.request_punchlist_service(
  p_task_ids uuid[],
  p_contact_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_ids uuid[];
  v_count int;
  v_request_id uuid;
  v_existing uuid[];
  v_description text;
BEGIN
  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found'; END IF;

  PERFORM private.punchlist_customer_access(p_contact_id, v_contact.organization_id);

  PERFORM 1 FROM public.contacts WHERE id = p_contact_id FOR UPDATE;

  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids
  FROM unnest(p_task_ids) x WHERE x IS NOT NULL;
  IF COALESCE(cardinality(v_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one item';
  END IF;

  SELECT count(*) INTO v_count FROM public.punchlist_tasks
  WHERE id = ANY(v_ids) AND contact_id = p_contact_id
    AND organization_id = v_contact.organization_id;
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Invalid punchlist selection' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.punchlist_tasks WHERE id = ANY(v_ids)
      AND (status <> 'requested' OR service_request_id IS NULL)
  ) THEN
    SELECT array_agg(DISTINCT service_request_id) INTO v_existing
    FROM public.punchlist_tasks WHERE id = ANY(v_ids);
    IF cardinality(v_existing) = 1 AND EXISTS (
      SELECT 1 FROM public.service_requests WHERE id = v_existing[1] AND status = 'open'
    ) THEN
      RETURN v_existing[1];
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.punchlist_tasks WHERE id = ANY(v_ids)
      AND (status <> 'draft' OR service_request_id IS NOT NULL OR work_order_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Some selected items have already been requested. Refresh your list.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.punchlist_tasks WHERE id = ANY(v_ids)
      AND COALESCE(NULLIF(BTRIM(details), ''), NULLIF(BTRIM(title), '')) IS NULL
  ) THEN
    RAISE EXCEPTION 'Describe what needs attention before requesting service';
  END IF;

  SELECT string_agg('- ' || COALESCE(NULLIF(BTRIM(details), ''), title), E'\n'
    ORDER BY priority_order, created_at, id)
  INTO v_description
  FROM public.punchlist_tasks WHERE id = ANY(v_ids);

  INSERT INTO public.service_requests (
    organization_id, contact_id, customer_name, customer_phone, customer_email,
    job_location_address, job_location_city, job_location_state, job_location_zip,
    job_description, billable_type, billable_by, priority, notes, status,
    source_type, created_by
  ) VALUES (
    v_contact.organization_id, p_contact_id,
    COALESCE(v_contact.full_name, v_contact.company_name, 'Customer'),
    v_contact.phone, v_contact.email,
    COALESCE(v_contact.street_address, 'Address on file'),
    v_contact.city, v_contact.state, v_contact.zip_code,
    'Punchlist Service Request' || E'\n\n' || v_description
      || COALESCE(E'\n\nNotes: ' || NULLIF(BTRIM(p_notes), ''), ''),
    'billable', 'admin', 'normal',
    'Created from customer punchlist portal', 'open', 'punchlist',
    (SELECT id FROM public.profiles WHERE id = auth.uid())
  ) RETURNING id INTO v_request_id;

  UPDATE public.punchlist_tasks
  SET status = 'requested',
      service_request_id = v_request_id,
      requested_at = now(),
      updated_at = now()
  WHERE id = ANY(v_ids);

  RETURN v_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_punchlist_service(uuid[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_punchlist_service(uuid[], uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
