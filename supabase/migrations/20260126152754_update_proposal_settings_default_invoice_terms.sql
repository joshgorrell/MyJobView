/*
  # Update Proposal Settings Default Invoice Terms

  1. Changes to proposal_settings table
    - Update `progress_invoice_terms` default from 'net_30' to 'net_10'
    - This aligns with the new Net 10 standard for progress billing

  2. Data Migration
    - Update existing proposal_settings that have 'net_30' to 'net_10' for non-PO proposals
    - Keep 'net_30' for proposals with purchase_order acceptance method

  3. Notes
    - Net 10 is now the standard for regular payment billing
    - Net 30 is reserved for Purchase Order billing
*/

-- Update default value for progress_invoice_terms to Net 10
ALTER TABLE proposal_settings
ALTER COLUMN progress_invoice_terms SET DEFAULT 'net_10';

-- Update existing proposal_settings to use Net 10 if they're using the old default Net 30
-- BUT keep Net 30 for proposals where purchase orders are the acceptance method
UPDATE proposal_settings
SET progress_invoice_terms = 'net_10'
WHERE progress_invoice_terms = 'net_30'
  AND NOT ('purchase_order' = ANY(acceptance_methods))
  AND NOT ('purchase_order' = ANY(payment_methods_allowed));

-- Add comment explaining the field
COMMENT ON COLUMN proposal_settings.progress_invoice_terms IS 'Payment terms for progress invoices. Defaults to net_10 for standard billing, net_30 for PO customers.';
