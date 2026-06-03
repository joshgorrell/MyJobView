/*
  # Add Proposal Title and Jobsite Location

  1. New Columns
    - `jobsite_address` (text) - Street address for the jobsite
    - `jobsite_city` (text) - City for the jobsite
    - `jobsite_state` (text) - State for the jobsite
    - `jobsite_zip` (text) - ZIP code for the jobsite
    - `jobsite_notes` (text) - Additional jobsite notes (e.g., "Summer House", "Rental Property")

  2. Purpose
    - Allow proposals to have a different jobsite location than the customer's billing address
    - Support customers with multiple properties (primary home, summer house, rental properties, etc.)
    - Title field already exists in proposals table, just ensuring it's used in UI

  3. Notes
    - Jobsite location is optional
    - If not specified, customer's billing address is assumed
    - Jobsite notes can help identify which property this is for
*/

-- Add jobsite location columns to proposals table
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS jobsite_address text,
  ADD COLUMN IF NOT EXISTS jobsite_city text,
  ADD COLUMN IF NOT EXISTS jobsite_state text,
  ADD COLUMN IF NOT EXISTS jobsite_zip text,
  ADD COLUMN IF NOT EXISTS jobsite_notes text;