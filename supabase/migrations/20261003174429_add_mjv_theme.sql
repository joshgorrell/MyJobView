-- Replace the visible System choice with MJV. Retain the legacy value in the
-- constraint while older clients can still submit it during a staged rollout.
begin;

alter table public.profiles
  drop constraint if exists profiles_ui_theme_check;

alter table public.profiles
  add constraint profiles_ui_theme_check
  check (ui_theme in ('light', 'dark', 'classic', 'mjv', 'system'));

update public.profiles set ui_theme = 'mjv' where ui_theme = 'system';

commit;
