/*
  # Add Payment Terms to Proposals

  ## Summary
  Adds payment_terms column to proposals table so that payment terms configured
  in the proposal settings billing tab are properly saved and used when creating
  sales orders and invoices during the approval workflow.

  ## Problem
  When users set payment terms in the proposal settings billing tab (e.g., "Net 30", 
  "Net 45", "Due on Receipt"), these terms were not being saved to the proposal.
  The unified approval workflow expected to read payment terms from the proposal,
  but the field didn't exist, causing it to always default to "Net 30".

  ## Solution
  Add a payment_terms column to store the selected payment terms. The ManualApprovalModal
  will save this value during approval, and the unified approval workflow will use it
  when creating sales orders and invoices.

  ## Changes
  1. Add payment_terms column to proposals table
  2. Default to 'Net 30' for backward compatibility
  3. Index for filtering/reporting by payment terms

  ## Impact
  - Sales orders and invoices will now use the correct payment terms from proposal settings
  - Fixes the issue where manual approval wasn't respecting payment terms
  - Provides consistency between proposal settings and billing documents
*/

-- Add payment_terms column to proposals
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'payment_terms'
  ) THEN
    ALTER TABLE proposals 
    ADD COLUMN payment_terms text DEFAULT 'Net 30';
  END IF;
END $$;

-- Add index for filtering by payment terms
CREATE INDEX IF NOT EXISTS idx_proposals_payment_terms 
ON proposals(payment_terms) 
WHERE payment_terms IS NOT NULL;

-- Add helpful comment
COMMENT ON COLUMN proposals.payment_terms IS 
'Payment terms for the balance invoice (e.g., "Net 30", "Net 45", "Due on Receipt"). Used when creating sales orders and balance invoices after deposit is paid.';