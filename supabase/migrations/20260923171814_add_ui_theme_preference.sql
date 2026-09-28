alter table public.profiles
  add column if not exists ui_theme text not null default 'dark'
  check (ui_theme in ('light', 'dark', 'system'));
