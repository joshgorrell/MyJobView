/*
  # Add All Modifiers to Proposal Settings

  1. New Columns
    - `discount_percent` (numeric, default 0) - Default discount percentage for new proposals
    - `project_design_percent` (numeric, default 0) - Default project design fee percentage
    - `custom_modifier_1_label` (text) - Label for custom modifier 1
    - `custom_modifier_1_percent` (numeric, default 0) - Default percentage for custom modifier 1
    - `custom_modifier_2_label` (text) - Label for custom modifier 2
    - `custom_modifier_2_percent` (numeric, default 0) - Default percentage for custom modifier 2

  2. Purpose
    - Allow admins to set default modifiers that apply to all new proposals
    - Sales reps can override these defaults on individual proposals
    - Ensures consistency across proposals while allowing flexibility

  3. Notes
    - These are defaults in proposal_settings
    - Actual per-proposal values are stored in the proposals table
    - When creating a new proposal, these defaults should be copied to the proposals table
*/

-- Add new modifier columns to proposal_settings
ALTER TABLE proposal_settings
  ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_design_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_modifier_1_label text,
  ADD COLUMN IF NOT EXISTS custom_modifier_1_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_modifier_2_label text,
  ADD COLUMN IF NOT EXISTS custom_modifier_2_percent numeric DEFAULT 0;