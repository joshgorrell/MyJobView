ALTER TABLE profiles ADD COLUMN IF NOT EXISTS proposals_visible_rep_ids uuid[] DEFAULT NULL

\nCOMMENT ON COLUMN profiles.proposals_visible_rep_ids IS 'Per-user setting controlling which rep IDs appear as filter pills in the proposals list. NULL means show all reps.'


