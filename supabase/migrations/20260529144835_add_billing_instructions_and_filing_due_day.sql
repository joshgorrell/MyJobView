/*
  # Add Billing Instructions Notes and Tax Filing Due Day

  1. Changes to `company_settings`
    - `billing_instructions_notes` (jsonb) — per-state admin annotations for the billing team.
      Structure: { "KS": "Custom note for Kansas", "MO": "..." }
    - `tax_filing_due_day` (integer) — day of the following month when sales tax returns are due.
      Default: 25 (most states). Admins can update this without a code deploy.

  2. Notes
    - Both columns are nullable to avoid breaking existing rows.
    - No RLS changes needed; company_settings inherits existing policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'billing_instructions_notes'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN billing_instructions_notes jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'tax_filing_due_day'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN tax_filing_due_day integer DEFAULT 25;
  END IF;
END $$;
