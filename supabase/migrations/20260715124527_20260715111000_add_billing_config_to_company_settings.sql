/*
# Add Billing Configuration Columns to company_settings

## Summary
Adds 10 new columns to company_settings for admin-level control of the
billing preference system. All columns have safe defaults so existing
behavior (monthly-only billing, no discount) is preserved.

## New Columns on company_settings
1. annual_billing_enabled (boolean, default false)
   Master toggle — if false, only monthly billing is offered.
2. default_billing_preference (text, default 'monthly', CHECK in 'monthly','annual')
   The default assigned to new customers who haven't chosen.
3. annual_discount_type (text, default 'none', CHECK in 'percentage','flat','none')
   How the annual prepay discount is calculated.
4. annual_discount_percentage (numeric, default 0)
   Percentage off when annual_discount_type = 'percentage' (e.g., 5 = 5% off).
5. annual_discount_flat_amount (numeric, default 0)
   Flat dollar amount off when annual_discount_type = 'flat'.
6. customer_can_change_billing_preference (boolean, default true)
   Whether portal users may switch between monthly and annual.
7. staff_can_override_billing_preference (boolean, default true)
   Whether staff may override a customer's billing preference per-agreement.
8. billing_proration_rule (text, default 'next_cycle', CHECK in 'full_period','prorate_partial','next_cycle')
   How mid-cycle billing changes are handled.
9. billing_change_effective_date (text, default 'next_cycle', CHECK in 'immediate','next_cycle')
   When a billing preference change takes effect.
10. default_auto_renew (boolean, default true)
    Company-level default for auto-renewal on new agreements.
11. grace_period_days (integer, default 0)
    Days after due date before a recurring invoice is marked overdue.

## Security
No RLS changes needed — existing company_settings policies cover new columns.
*/

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS annual_billing_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_billing_preference text DEFAULT 'monthly'
    CHECK (default_billing_preference IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS annual_discount_type text DEFAULT 'none'
    CHECK (annual_discount_type IN ('percentage', 'flat', 'none')),
  ADD COLUMN IF NOT EXISTS annual_discount_percentage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_discount_flat_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_can_change_billing_preference boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS staff_can_override_billing_preference boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS billing_proration_rule text DEFAULT 'next_cycle'
    CHECK (billing_proration_rule IN ('full_period', 'prorate_partial', 'next_cycle')),
  ADD COLUMN IF NOT EXISTS billing_change_effective_date text DEFAULT 'next_cycle'
    CHECK (billing_change_effective_date IN ('immediate', 'next_cycle')),
  ADD COLUMN IF NOT EXISTS default_auto_renew boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS grace_period_days integer DEFAULT 0;
