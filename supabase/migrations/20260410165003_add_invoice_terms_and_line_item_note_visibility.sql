/*
  # Invoice Terms & Conditions and Line Item Note Visibility

  ## Summary
  Adds two new fields to support invoice improvements:

  1. **company_settings** - New column:
     - `default_invoice_terms_and_conditions` (text): Company-wide default T&C text that auto-prints on every invoice. Admin-managed, not editable per invoice.

  2. **invoice_line_items** - New column:
     - `notes_visible_on_invoice` (boolean, default false): Controls whether a line item note is customer-visible (printed on invoice) or internal-only (private). Default is private/internal.

  ## Security
  - No new tables, existing RLS policies cover both tables.
*/

-- Add default T&C text to company settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'default_invoice_terms_and_conditions'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN default_invoice_terms_and_conditions text;
  END IF;
END $$;

-- Add note visibility flag to invoice line items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_line_items' AND column_name = 'notes_visible_on_invoice'
  ) THEN
    ALTER TABLE invoice_line_items ADD COLUMN notes_visible_on_invoice boolean DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN company_settings.default_invoice_terms_and_conditions IS 'Default terms and conditions text printed at the bottom of every invoice. Set by admin, not editable per invoice.';
COMMENT ON COLUMN invoice_line_items.notes_visible_on_invoice IS 'When true, the line item note is printed on the customer-facing invoice. When false, the note is internal-only.';
