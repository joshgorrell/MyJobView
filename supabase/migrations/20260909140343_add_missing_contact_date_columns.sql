ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS last_contact_date timestamptz,
  ADD COLUMN IF NOT EXISTS next_follow_up timestamptz;
