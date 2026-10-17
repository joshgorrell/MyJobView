/*\n  # Add Payment Methods Configuration and Refactor Deposit Flow\n\n  1. New Fields\n    - Add `payment_methods_allowed` to contacts table (per-customer payment restrictions)\n    - Add `payment_methods_allowed` to proposal_settings table (per-proposal overrides)\n    - Add `acceptance_method_used` to proposals table (tracks which method was used)\n\n  2. Changes\n    - Deprecate deposit_paid boolean (keep for historical data, no longer used in logic)\n    - Remove deposit_paid from trigger logic\n    - All deposit invoices created with status 'sent' instead of 'paid'\n    - Sales order status transitions based on invoice payment status\n\n  3. Business Logic\n    - Customer profile defines allowed payment methods (default: both)\n    - Proposal settings can override customer-level restrictions\n    - Purchase Order method bypasses deposit requirement\n    - Payment method creates invoice as "sent" for customer to pay\n    - Invoice status change triggers sales order status update\n\n  4. Payment Methods\n    - 'payment' - Customer pays deposit (online or offline)\n    - 'purchase_order' - Commercial customer with approved credit terms\n*/\n\n-- Add payment_methods_allowed to contacts (per-customer configuration)\nALTER TABLE contacts ADD COLUMN IF NOT EXISTS payment_methods_allowed text[]\n  DEFAULT ARRAY['payment', 'purchase_order']::text[]

\n\n-- Add payment_methods_allowed to proposal_settings (per-proposal override)\nALTER TABLE proposal_settings ADD COLUMN IF NOT EXISTS payment_methods_allowed text[]\n  DEFAULT NULL

\n\n-- Add acceptance_method_used to proposals to track what method was actually used\nALTER TABLE proposals ADD COLUMN IF NOT EXISTS acceptance_method_used text

\n\n-- Add constraint for valid acceptance methods\nALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_acceptance_method_used_check

\nALTER TABLE proposals ADD CONSTRAINT proposals_acceptance_method_used_check\n  CHECK (acceptance_method_used IN ('payment', 'purchase_order', 'verbal'))

\n\n-- Add comments\nCOMMENT ON COLUMN contacts.payment_methods_allowed IS 'Payment methods allowed for this customer: payment, purchase_order. Defaults to both.'

\nCOMMENT ON COLUMN proposal_settings.payment_methods_allowed IS 'Payment methods allowed for this specific proposal (overrides customer default). NULL = use customer default.'

\nCOMMENT ON COLUMN proposals.acceptance_method_used IS 'The actual acceptance method used when proposal was approved: payment, purchase_order, or verbal'

\nCOMMENT ON COLUMN proposals.deposit_paid IS 'DEPRECATED: No longer used in logic. Historical data only. Use invoice payment status instead.'

\n\n-- Function to get allowed payment methods for a proposal (considers both customer and proposal-level settings)\nCREATE OR REPLACE FUNCTION get_proposal_payment_methods(p_proposal_id uuid)\nRETURNS text[]\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path TO 'public'\nAS $$\nDECLARE\n  v_methods text[]

\nBEGIN\n  -- Get payment methods from proposal settings (if set), otherwise from customer profile\n  SELECT\n    COALESCE(ps.payment_methods_allowed, c.payment_methods_allowed, ARRAY['payment', 'purchase_order']::text[])\n  INTO v_methods\n  FROM proposals p\n  LEFT JOIN proposal_settings ps ON ps.proposal_id = p.id\n  LEFT JOIN contacts c ON c.id = p.contact_id\n  WHERE p.id = p_proposal_id

\n\n  RETURN COALESCE(v_methods, ARRAY['payment', 'purchase_order']::text[])

\nEND

\n$$

\n\nGRANT EXECUTE ON FUNCTION get_proposal_payment_methods(uuid) TO authenticated

\n\nCOMMENT ON FUNCTION get_proposal_payment_methods(uuid) IS 'Returns allowed payment methods for a proposal, considering both proposal and customer settings'

\n
