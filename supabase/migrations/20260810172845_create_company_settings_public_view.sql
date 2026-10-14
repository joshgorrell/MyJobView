-- F5 support: a view of company_settings without the secret columns, so screens that\n-- previously did select('*') keep working without reaching the API keys.\nDO $$\nDECLARE\n  col_list text

\nBEGIN\n  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)\n    INTO col_list\n  FROM information_schema.columns\n  WHERE table_schema = 'public'\n    AND table_name = 'company_settings'\n    AND column_name NOT IN (\n      'google_maps_api_key', 'twilio_account_sid', 'twilio_auth_token',\n      'twilio_phone_number', 'gemini_api_key', 'openai_api_key',\n      'zip_tax_api_key', 'taxjar_api_key', 'stripe_invoice_secret_key',\n      'bill_com_api_key'\n    )

\n\n  EXECUTE format(\n    'CREATE OR REPLACE VIEW public.company_settings_public WITH (security_invoker = true) AS SELECT %s FROM public.company_settings',\n    col_list)

\nEND $$

\n\nGRANT SELECT ON public.company_settings_public TO authenticated

\n
