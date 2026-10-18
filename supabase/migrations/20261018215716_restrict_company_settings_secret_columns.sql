/*
# Restrict read access to secret columns on company_settings

1. Problem
   - Every signed-in user in an organization could read `company_settings` rows for
     that organization, and row level security cannot hide individual columns.
   - That exposed `twilio_auth_token`, `openai_api_key`, `gemini_api_key`,
     `zip_tax_api_key` and `taxjar_api_key` to technicians and portal customers.

2. Changes
   - Adds read-only generated boolean columns (`has_*`) so admin screens can show
     whether a credential is configured without reading its value.
   - Revokes table level SELECT from `anon` and `authenticated` and re-grants
     column level SELECT on every column except the secret ones.
   - `google_maps_api_key` and `twilio_account_sid` remain readable: the maps key is
     a browser embedded, referrer restricted key used by the map screens, and the
     Twilio account SID is an identifier that is useless without the auth token.

3. Notes
   1. INSERT/UPDATE privileges are untouched, so admins can still save credentials.
   2. `service_role` is unaffected; server side code keeps full access.
   3. No data is modified or removed.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_settings' AND column_name='has_twilio_auth_token') THEN
    ALTER TABLE public.company_settings ADD COLUMN has_twilio_auth_token boolean GENERATED ALWAYS AS (twilio_auth_token IS NOT NULL AND twilio_auth_token <> '') STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_settings' AND column_name='has_openai_api_key') THEN
    ALTER TABLE public.company_settings ADD COLUMN has_openai_api_key boolean GENERATED ALWAYS AS (openai_api_key IS NOT NULL AND openai_api_key <> '') STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_settings' AND column_name='has_gemini_api_key') THEN
    ALTER TABLE public.company_settings ADD COLUMN has_gemini_api_key boolean GENERATED ALWAYS AS (gemini_api_key IS NOT NULL AND gemini_api_key <> '') STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_settings' AND column_name='has_zip_tax_api_key') THEN
    ALTER TABLE public.company_settings ADD COLUMN has_zip_tax_api_key boolean GENERATED ALWAYS AS (zip_tax_api_key IS NOT NULL AND zip_tax_api_key <> '') STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_settings' AND column_name='has_taxjar_api_key') THEN
    ALTER TABLE public.company_settings ADD COLUMN has_taxjar_api_key boolean GENERATED ALWAYS AS (taxjar_api_key IS NOT NULL AND taxjar_api_key <> '') STORED;
  END IF;
END $$;

DO $$
DECLARE
  v_cols text;
  v_secret text[] := ARRAY[
    'twilio_auth_token','openai_api_key','gemini_api_key','zip_tax_api_key','taxjar_api_key'
  ];
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'company_settings'
    AND NOT (column_name = ANY (v_secret));

  EXECUTE 'REVOKE SELECT ON TABLE public.company_settings FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.company_settings TO anon, authenticated', v_cols);
END $$;