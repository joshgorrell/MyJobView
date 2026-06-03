/*
  # Add Proposal Filter Preferences to Profiles
  
  1. New Columns
    - `proposals_hide_declined` (boolean) - User preference to hide declined proposals from list view
    - `proposals_hide_archived` (boolean) - User preference to hide archived proposals from list view
  
  2. Changes
    - Add columns to profiles table with default false
    - Allow users to customize their default proposal list view
*/

-- Add filter preference columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS proposals_hide_declined boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS proposals_hide_archived boolean DEFAULT false;

-- Add helpful comments
COMMENT ON COLUMN profiles.proposals_hide_declined IS 'User preference to hide declined proposals from the proposals list view';
COMMENT ON COLUMN profiles.proposals_hide_archived IS 'User preference to hide archived proposals from the proposals list view';
