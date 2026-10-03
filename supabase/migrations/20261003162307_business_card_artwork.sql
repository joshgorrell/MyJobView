-- Separate dealer artwork from the company logo. NULL uses the brand default;
-- an empty string intentionally displays the gradient with no artwork.
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS business_card_banner_url text;
GRANT SELECT (business_card_banner_url) ON public.company_settings TO authenticated;

-- Public visitors need only the card owner's public branding, never all settings.
-- SECURITY DEFINER is required because anonymous visitors cannot read profiles.
CREATE OR REPLACE FUNCTION public.get_business_card_branding(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'organization_id', p.organization_id,
    'company_name', s.company_name,
    'company_logo_url', s.company_logo_url,
    'website', s.website,
    'business_card_banner_url', s.business_card_banner_url
  )
  FROM public.business_cards c
  JOIN public.profiles p ON p.id = c.user_id
  JOIN public.company_settings s ON s.organization_id = p.organization_id
  WHERE c.slug = p_slug AND (c.is_active OR c.user_id = (SELECT auth.uid()))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_business_card_branding(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_card_branding(text) TO anon, authenticated;

-- A narrow setter checks active dealer administrators before updating branding.
CREATE OR REPLACE FUNCTION public.set_business_card_banner(p_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND is_active = true AND role IN ('admin', 'manager');
  IF v_org IS NULL THEN RAISE EXCEPTION 'Dealer administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_url IS NOT NULL AND p_url <> '' AND (length(p_url) > 2048 OR p_url !~ '^https://') THEN
    RAISE EXCEPTION 'Invalid banner URL';
  END IF;
  UPDATE public.company_settings SET business_card_banner_url = p_url, updated_at = now()
    WHERE organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company settings not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_business_card_banner(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_business_card_banner(text) TO authenticated;
