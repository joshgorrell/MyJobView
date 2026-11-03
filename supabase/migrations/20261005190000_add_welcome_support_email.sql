ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS welcome_support_email text;

COMMENT ON COLUMN public.company_settings.welcome_support_email IS
  'Dealer-configured help address shown in employee Welcome emails.';

UPDATE public.company_settings
SET welcome_support_email = 'josh@electroniclife.com'
WHERE lower(trim(company_name)) = 'electronic life'
  AND (welcome_support_email IS NULL OR trim(welcome_support_email) = '');
