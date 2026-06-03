/*
  # Add Kiosk Office ID to Company Settings

  1. Changes
    - `company_settings` table gets a new `kiosk_office_id` column
      - Nullable UUID referencing `company_offices(id)` with SET NULL on delete
      - When set, kiosk lead/contact submissions will use this office
      - When null, the system falls back to the first office by display_order (existing behavior)

  2. Notes
    - No default value; null means "use first office by display_order"
    - ON DELETE SET NULL ensures the setting auto-clears if the selected office is deleted,
      falling back gracefully to the first-office behavior
    - No data migration needed; existing rows will have null which preserves current behavior
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'kiosk_office_id'
  ) THEN
    ALTER TABLE company_settings
      ADD COLUMN kiosk_office_id uuid REFERENCES company_offices(id) ON DELETE SET NULL;
  END IF;
END $$;
