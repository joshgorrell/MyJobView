/*
# Restrict read access to secret columns on organizations

1. Problem
   - The `organizations` table is readable by the `anon` and `authenticated` roles
     through the policy "Anyone can read active org info" (USING is_active = true).
   - Row level security cannot hide individual columns, so every caller holding the
     publishable anon key could read `twilio_auth_token`, `openai_api_key`,
     `gemini_api_key`, `zip_tax_api_key`, `google_maps_api_key`,
     `stripe_invoice_secret_key` and `bill_com_api_key` for every active organization.

2. Changes
   - Adds read-only generated boolean columns (`has_*`) so admin screens can still show
     whether a credential is configured without reading the credential itself.
   - Revokes table level SELECT from `anon` and `authenticated` and re-grants
     column level SELECT on every column EXCEPT the secret ones.
   - INSERT/UPDATE/DELETE privileges are untouched, so administrators can still
     save and rotate credentials.

3. Notes
   1. `service_role` is unaffected and server side code keeps full access.
   2. No data is modified or removed.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='has_twilio_auth_token') THEN
    ALTER TABLE public.organizations ADD COLUMN has_twilio_auth_token boolean GENERATED ALWAYS AS (twilio_auth_token IS NOT NULL AND twilio_auth_token <> '') STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='has_openai_api_key') THEN
    ALTER TABLE public.organizations ADD COLUMN has_openai_api_key boolean GENERATED ALWAYS AS (openai_api_key IS NOT NULL AND openai_api_key <> '') STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='has_gemini_api_key') THEN
    ALTER TABLE public.organizations ADD COLUMN has_gemini_api_key boolean GENERATED ALWAYS AS (gemini_api_key IS NOT NULL AND gemini_api_key <> '') STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='has_zip_tax_api_key') THEN
    ALTER TABLE public.organizations ADD COLUMN has_zip_tax_api_key boolean GENERATED ALWAYS AS (zip_tax_api_key IS NOT NULL AND zip_tax_api_key <> '') STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='has_google_maps_api_key') THEN
    ALTER TABLE public.organizations ADD COLUMN has_google_maps_api_key boolean GENERATED ALWAYS AS (google_maps_api_key IS NOT NULL AND google_maps_api_key <> '') STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='has_stripe_invoice_secret_key') THEN
    ALTER TABLE public.organizations ADD COLUMN has_stripe_invoice_secret_key boolean GENERATED ALWAYS AS (stripe_invoice_secret_key IS NOT NULL AND stripe_invoice_secret_key <> '') STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='has_bill_com_api_key') THEN
    ALTER TABLE public.organizations ADD COLUMN has_bill_com_api_key boolean GENERATED ALWAYS AS (bill_com_api_key IS NOT NULL AND bill_com_api_key <> '') STORED;
  END IF;
END $$;

DO $$
DECLARE
  v_cols text;
  v_secret text[] := ARRAY[
    'twilio_auth_token','twilio_account_sid','openai_api_key','gemini_api_key',
    'zip_tax_api_key','google_maps_api_key','stripe_invoice_secret_key','bill_com_api_key'
  ];
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'organizations'
    AND NOT (column_name = ANY (v_secret));

  EXECUTE 'REVOKE SELECT ON TABLE public.organizations FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.organizations TO anon, authenticated', v_cols);
END $$;