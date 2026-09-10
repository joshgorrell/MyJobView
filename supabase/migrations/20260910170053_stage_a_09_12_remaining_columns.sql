/*
# Stage A.9 + A.10 + A.11 + A.12: Remaining Schema Additions

## Purpose
Adds the remaining foundational columns:

1. (A.9) contacts.tax_rate CHECK constraint — PREPARED but NOT ENFORCED
   - Existing data is clean (all 32 values are between 0.0000 and 0.9350)
   - Per the approved plan, the constraint is held until the data quality report is reviewed
   - A ready-to-apply migration is documented in the comments below but not executed

2. (A.10) company_settings.taxjar_cache_max_age_hours — configurable cache policy
   - Nullable integer, no default
   - Application reads this to determine when cached TaxJar rates are stale
   - If null, the system prompts the admin to configure it

3. (A.11) contacts.tax_rate_verified_at — tracks last TaxJar verification
   - Nullable timestamptz

4. (A.12) proposals.tax_calculation_mode and change_orders.tax_calculation_mode
   - Text, default 'legacy', CHECK: 'legacy' | 'engine'
   - Enables comparison mode — legacy calculations continue, new engine runs alongside

## Modified Tables
- company_settings: + taxjar_cache_max_age_hours (integer, nullable)
- contacts: + tax_rate_verified_at (timestamptz, nullable)
- proposals: + tax_calculation_mode (text, default 'legacy', CHECK)
- change_orders: + tax_calculation_mode (text, default 'legacy', CHECK)

## Security
No RLS changes — existing per-table RLS covers the new columns.

## Important Notes
1. The contacts.tax_rate CHECK constraint is NOT added in this migration
2. All existing proposals and change_orders default to 'legacy' mode — no behavior change
3. No production tax calculations are changed
*/

DO $$ BEGIN
  -- A.10: company_settings.taxjar_cache_max_age_hours
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'taxjar_cache_max_age_hours'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN taxjar_cache_max_age_hours integer;
  END IF;

  -- A.11: contacts.tax_rate_verified_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'tax_rate_verified_at'
  ) THEN
    ALTER TABLE contacts ADD COLUMN tax_rate_verified_at timestamptz;
  END IF;

  -- A.12: proposals.tax_calculation_mode
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'tax_calculation_mode'
  ) THEN
    ALTER TABLE proposals ADD COLUMN tax_calculation_mode text NOT NULL DEFAULT 'legacy'
      CHECK (tax_calculation_mode IN ('legacy', 'engine'));
  END IF;

  -- A.12: change_orders.tax_calculation_mode
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'tax_calculation_mode'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN tax_calculation_mode text NOT NULL DEFAULT 'legacy'
      CHECK (tax_calculation_mode IN ('legacy', 'engine'));
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- A.9: PREPARED but NOT ENFORCED — contacts.tax_rate CHECK constraint
-- ═════════════════════════════════════════════════════════════════════════════
--
-- The following constraint is documented here for future application AFTER the
-- data quality report is reviewed and approved. It is NOT executed in this migration.
--
-- Data quality findings (as of 2026-09-10):
--   - 2,507 total contacts
--   - 32 contacts have a tax_rate value
--   - All 32 values are valid decimals (range 0.0000 to 0.9350)
--   - 0 values would violate a BETWEEN 0 AND 1 CHECK constraint
--   - 25 contacts use "Kansas" (full name) instead of "KS" for state
--   - 1 contact has an empty string for state
--
-- Per the approved plan, the order is:
--   1. Data quality report (this migration documents it)
--   2. Identify invalid formats (none found for tax_rate)
--   3. Review/approve cleanup
--   4. Normalize approved records (state format: "Kansas" → "KS")
--   5. Then add the CHECK constraint
--
-- Ready-to-apply SQL (NOT executed here):
--
--   ALTER TABLE contacts
--     ADD CONSTRAINT contacts_tax_rate_range_check
--     CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 1));
--
