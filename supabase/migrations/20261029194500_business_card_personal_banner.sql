-- Personal card backgrounds override company artwork without changing it.
ALTER TABLE public.business_cards ADD COLUMN IF NOT EXISTS banner_url text;
