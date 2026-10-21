-- Customer-facing proposal template display preferences.
ALTER TABLE public.proposal_report_templates
  ADD COLUMN IF NOT EXISTS show_installed_price boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_item_color boolean NOT NULL DEFAULT false;
