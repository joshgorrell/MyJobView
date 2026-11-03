/*
# Add welcome_support_email column to company_settings

## Purpose
PR #106 added a dealer-configurable support email address for employee Welcome
emails. The column was defined locally but never applied to the live database.

## Changes
1. Adds `welcome_support_email` (text) column to `company_settings`.
2. Sets Electronic Life's `welcome_support_email` to `josh@electroniclife.com`
   (only if currently null/empty).

## Security
- No RLS changes. No new tables.
*/

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS welcome_support_email text;

COMMENT ON COLUMN public.company_settings.welcome_support_email IS
  'Dealer-configured help address shown in employee Welcome emails.';

UPDATE public.company_settings
SET welcome_support_email = 'josh@electroniclife.com'
WHERE lower(trim(company_name)) = 'electronic life'
  AND (welcome_support_email IS NULL OR trim(welcome_support_email) = '');
