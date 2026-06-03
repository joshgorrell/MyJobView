/*
  # Add Missing invoice_type Column to Invoices Table

  1. Overview
    This migration adds the missing `invoice_type` column to the invoices table.
    This column is required by various approval workflow functions but was missing.

  2. New Column
    - `invoice_type` (text) - Type of invoice: 'deposit', 'progress', 'final', 'change_order', 'standard'
    - Default value: 'standard' for existing records

  3. Security
    - No RLS changes needed - column is just metadata
*/

-- Add invoice_type column to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS invoice_type text 
CHECK (invoice_type IN ('deposit', 'progress', 'final', 'change_order', 'standard', 'recurring'))
DEFAULT 'standard';

-- Update existing invoices to set appropriate type based on context
UPDATE invoices
SET invoice_type = CASE
  -- If linked to proposal and amount roughly matches deposit, it's a deposit invoice
  WHEN proposal_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM proposals p 
      WHERE p.id = invoices.proposal_id 
      AND p.deposit_invoice_id = invoices.id
    )
  THEN 'deposit'
  -- If linked to sales order progress billing
  WHEN sales_order_id IS NOT NULL 
    AND billed_from_proposal = true 
    AND includes_change_orders = false
  THEN 'progress'
  -- If includes change orders
  WHEN includes_change_orders = true
  THEN 'change_order'
  -- Default to standard
  ELSE 'standard'
END
WHERE invoice_type = 'standard' OR invoice_type IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type ON invoices(invoice_type);

COMMENT ON COLUMN invoices.invoice_type IS 'Type of invoice: deposit (initial payment), progress (milestone billing), final (completion), change_order (modifications), standard (general), recurring (subscription)';
