-- Preserve the customer's selected Promise-page visibility across delivery channels.
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS include_promise_page boolean NOT NULL DEFAULT true;
