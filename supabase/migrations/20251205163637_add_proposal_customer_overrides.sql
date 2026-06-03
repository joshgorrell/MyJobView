/*
  # Add Proposal Customer Override Fields

  ## Summary
  Adds fields to the proposals table that allow overriding customer information for a specific proposal
  without modifying the master contact record. This is useful when customer details need to differ
  for a specific proposal (e.g., alternate billing address, different contact person for this job).

  ## Changes Made

  1. **New Columns Added to `proposals` table**
     - `customer_override_first_name` (text) - Override first name for this proposal
     - `customer_override_last_name` (text) - Override last name for this proposal
     - `customer_override_company_name` (text) - Override company name for this proposal
     - `customer_override_email` (text) - Override email for this proposal
     - `customer_override_phone` (text) - Override phone for this proposal
     - `customer_override_street_address` (text) - Override billing street address for this proposal
     - `customer_override_city` (text) - Override billing city for this proposal
     - `customer_override_state` (text) - Override billing state for this proposal
     - `customer_override_zip` (text) - Override billing ZIP code for this proposal
     - `use_customer_override` (boolean) - Whether to use override values instead of contact record

  ## Important Notes
  - Override fields are optional
  - When `use_customer_override` is true, the proposal will use override values for customer display
  - When `use_customer_override` is false or null, the proposal uses the linked contact record
  - The contact_id field remains unchanged and maintains the relationship to the master contact
  - This allows tracking which contact a proposal belongs to while displaying different information
*/

-- Add customer override columns to proposals table
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS use_customer_override boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_override_first_name text,
  ADD COLUMN IF NOT EXISTS customer_override_last_name text,
  ADD COLUMN IF NOT EXISTS customer_override_company_name text,
  ADD COLUMN IF NOT EXISTS customer_override_email text,
  ADD COLUMN IF NOT EXISTS customer_override_phone text,
  ADD COLUMN IF NOT EXISTS customer_override_street_address text,
  ADD COLUMN IF NOT EXISTS customer_override_city text,
  ADD COLUMN IF NOT EXISTS customer_override_state text,
  ADD COLUMN IF NOT EXISTS customer_override_zip text;

-- Add index for filtering proposals with overrides (for reporting/admin purposes)
CREATE INDEX IF NOT EXISTS idx_proposals_use_customer_override
  ON proposals(use_customer_override)
  WHERE use_customer_override = true;
