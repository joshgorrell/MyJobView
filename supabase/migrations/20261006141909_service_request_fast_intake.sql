-- Optional intake constraints; keep existing request and work-order lifecycle.
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS earliest_date date,
  ADD COLUMN IF NOT EXISTS customer_contact_instruction text NOT NULL DEFAULT 'dispatch'
    CHECK (customer_contact_instruction IN ('dispatch', 'already_contacted', 'requester')),
  ADD COLUMN IF NOT EXISTS warranty_type text
    CHECK (warranty_type IN ('project', 'previous_service', 'equipment', 'other')),
  ADD COLUMN IF NOT EXISTS warranty_reference text,
  ADD COLUMN IF NOT EXISTS warranty_notes text;
ALTER TABLE public.service_requests ADD CONSTRAINT service_request_scheduling_window
  CHECK (earliest_date IS NULL OR requested_date IS NULL OR earliest_date <= requested_date::date);
