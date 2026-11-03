-- F5: every signed-in user could read the stored third-party API keys and Twilio\n-- credentials. Grant SELECT on the non-secret columns only, and expose the secrets\n-- through an admin-only function.\nDO $$\nDECLARE\n  col_list text

\nBEGIN\n  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)\n    INTO col_list\n  FROM information_schema.columns\n  WHERE table_schema = 'public'\n    AND table_name = 'company_settings'\n    AND column_name NOT IN (\n      'google_maps_api_key', 'twilio_account_sid', 'twilio_auth_token',\n      'twilio_phone_number', 'gemini_api_key', 'openai_api_key',\n      'zip_tax_api_key', 'taxjar_api_key', 'stripe_invoice_secret_key',\n      'bill_com_api_key'\n    )

\n\n  EXECUTE 'REVOKE SELECT ON public.company_settings FROM authenticated'

\n  EXECUTE 'REVOKE SELECT ON public.company_settings FROM anon'

\n  EXECUTE format('GRANT SELECT (%s) ON public.company_settings TO authenticated', col_list)

\nEND $$

\n\n-- Admin-only read of the secret columns, for the settings screens that manage them.\nCREATE OR REPLACE FUNCTION public.get_company_api_keys()\nRETURNS jsonb\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nSET search_path = public, pg_temp\nAS $$\nDECLARE\n  result jsonb

\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM public.profiles p\n    WHERE p.id = auth.uid() AND (p.is_global_admin = true OR p.role = 'admin')\n  ) THEN\n    RAISE EXCEPTION 'Not authorized'

\n  END IF

\n\n  SELECT to_jsonb(t) INTO result\n  FROM (\n    SELECT id, google_maps_api_key, twilio_account_sid, twilio_auth_token,\n           twilio_phone_number, gemini_api_key, openai_api_key, zip_tax_api_key,\n           taxjar_api_key, stripe_invoice_secret_key, bill_com_api_key\n    FROM public.company_settings\n    LIMIT 1\n  ) t

\n\n  RETURN COALESCE(result, '{}'::jsonb)

\nEND

\n$$

\n\nREVOKE ALL ON FUNCTION public.get_company_api_keys() FROM public, anon

\nGRANT EXECUTE ON FUNCTION public.get_company_api_keys() TO authenticated

\n\n-- Presence flags any signed-in user may safely see (used to enable/disable features).\nCREATE OR REPLACE FUNCTION public.get_company_api_key_presence()\nRETURNS jsonb\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER\nSET search_path = public, pg_temp\nAS $$\n  SELECT COALESCE(\n    (SELECT jsonb_build_object(\n       'openai', (openai_api_key IS NOT NULL AND openai_api_key <> ''),\n       'gemini', (gemini_api_key IS NOT NULL AND gemini_api_key <> ''),\n       'google_maps', (google_maps_api_key IS NOT NULL AND google_maps_api_key <> ''),\n       'taxjar', (taxjar_api_key IS NOT NULL AND taxjar_api_key <> ''),\n       'zip_tax', (zip_tax_api_key IS NOT NULL AND zip_tax_api_key <> ''),\n       'twilio', (twilio_auth_token IS NOT NULL AND twilio_auth_token <> '')\n     )\n     FROM public.company_settings LIMIT 1),\n    '{}'::jsonb)

\n$$

\n\nREVOKE ALL ON FUNCTION public.get_company_api_key_presence() FROM public, anon

\nGRANT EXECUTE ON FUNCTION public.get_company_api_key_presence() TO authenticated

\n
