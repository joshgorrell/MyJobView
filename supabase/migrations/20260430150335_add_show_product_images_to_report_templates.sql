/*
  # Add show_product_images to proposal_report_templates

  1. Changes
    - `show_product_images` (boolean, default true) — controls whether product photo
      thumbnails are displayed alongside line items in the customer portal and PDF exports.
      Defaults to true so thumbnails appear automatically on all existing templates.

  2. Notes
    - Sales reps can turn this off per-template to produce a cleaner, image-free layout.
    - The builder (internal sales view) always shows thumbnails regardless of this flag.
*/

ALTER TABLE proposal_report_templates
  ADD COLUMN IF NOT EXISTS show_product_images boolean NOT NULL DEFAULT true;
