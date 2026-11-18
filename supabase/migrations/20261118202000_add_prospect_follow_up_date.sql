ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS prospect_follow_up_on date;
