/*
  # Add Visibility Toggles for Proposal Scope and Tasks

  1. Changes
    - Add `show_scope` boolean to `proposal_rooms` - controls visibility of scope of work description on customer proposal
    - Add `show_task_notes` boolean to `proposal_line_items` - controls visibility of installation/task notes on customer proposal
    - Both default to false (hidden) for existing data, but new items will default to true
  
  2. Purpose
    - Allow users to show/hide scope of work per area
    - Allow users to show/hide task/installation notes per line item
    - Provides granular control over what customers see on proposals
*/

-- Add show_scope to proposal_rooms
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_rooms' AND column_name = 'show_scope'
  ) THEN
    ALTER TABLE proposal_rooms ADD COLUMN show_scope boolean DEFAULT true;
  END IF;
END $$;

-- Add show_task_notes to proposal_line_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_line_items' AND column_name = 'show_task_notes'
  ) THEN
    ALTER TABLE proposal_line_items ADD COLUMN show_task_notes boolean DEFAULT true;
  END IF;
END $$;