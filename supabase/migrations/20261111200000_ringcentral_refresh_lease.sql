-- Serialize RingCentral refresh-token rotation across concurrent voicemail workers.
-- A refresh grant may be single-use, so compare-and-swap AFTER refresh is insufficient.
alter table public.ringcentral_oauth_connections
  add column if not exists refresh_lease_id uuid,
  add column if not exists refresh_lease_expires_at timestamptz;
alter table public.ringcentral_oauth_connections
  add constraint ringcentral_refresh_lease_pair_check
  check ((refresh_lease_id is null) = (refresh_lease_expires_at is null));
create index if not exists ringcentral_oauth_refresh_lease_idx
  on public.ringcentral_oauth_connections(refresh_lease_expires_at)
  where refresh_lease_id is not null;
