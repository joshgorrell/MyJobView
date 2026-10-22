-- Location labels are administrator-supplied, not inferred from IP geolocation.
ALTER TABLE public.ip_nicknames
  ADD COLUMN IF NOT EXISTS location_classification text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.ip_nicknames
  ADD CONSTRAINT ip_nicknames_location_classification_check
  CHECK (location_classification IN ('office', 'remote', 'unknown'));
COMMENT ON COLUMN public.ip_nicknames.location_classification IS 'Manual network label only; does not establish employee physical presence.';
