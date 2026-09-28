alter table public.profiles
  drop constraint if exists profiles_ui_theme_check;

alter table public.profiles
  add constraint profiles_ui_theme_check
  check (ui_theme in ('light', 'dark', 'classic', 'system'));
