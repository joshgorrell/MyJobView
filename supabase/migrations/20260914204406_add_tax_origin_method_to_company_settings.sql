/*
# Add tax_origin_method to company_settings

## Purpose
Adds a dealer-level setting that controls which seller/origin address is used
for sales-tax sourcing on all transactions.

## New Column
- `company_settings.tax_origin_method` (text, NOT NULL, DEFAULT 'corporate')
  - 'corporate' — use the headquarters office address (company_offices where is_headquarters = true)
  - 'assigned_office' — use the address of the office assigned to each transaction

## CHECK Constraint
  CHECK (tax_origin_method IN ('corporate', 'assigned_office'))

## Security
No RLS changes. company_settings already has RLS enabled.

## Notes
- The salesperson does not choose tax origin on each proposal. This is a
  dealer-level default.
- The existing is_headquarters flag on company_offices identifies the
  corporate address. No new office table is created.
- Default is 'corporate' so existing dealers continue using their
  headquarters address for all transactions.
*/

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS tax_origin_method text NOT NULL DEFAULT 'corporate';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_tax_origin_method_check'
  ) THEN
    ALTER TABLE company_settings
      ADD CONSTRAINT company_settings_tax_origin_method_check
      CHECK (tax_origin_method IN ('corporate', 'assigned_office'));
  END IF;
END $$;
