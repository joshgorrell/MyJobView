/*
  # Add Kansas ST-36 Jurisdiction Code to Tax Jurisdictions

  ## Summary
  Adds a `ks_jurisdiction_code` column to the `tax_jurisdictions` table to support
  the Kansas ST-36 monthly sales tax filing worksheet.

  ## Changes

  ### Modified Tables
  - `tax_jurisdictions`
    - New column: `ks_jurisdiction_code` (text, nullable)
      - Stores the official Kansas DOR jurisdiction code used on the ST-36 form
      - Example: "028" for Wichita / Sedgwick County
      - When NULL, the monthly ST-36 report will flag the row with a warning
      - Not required for non-Kansas jurisdictions

  ## Notes
  - This column is optional (nullable) so existing jurisdictions are not affected
  - The ST-36 report UI will visually warn when a KS jurisdiction is missing this code
  - Only populated for Kansas (state = 'KS') jurisdictions used in filing
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tax_jurisdictions' AND column_name = 'ks_jurisdiction_code'
  ) THEN
    ALTER TABLE tax_jurisdictions ADD COLUMN ks_jurisdiction_code text;
  END IF;
END $$;

COMMENT ON COLUMN tax_jurisdictions.ks_jurisdiction_code IS
  'Kansas DOR ST-36 jurisdiction code (e.g. "028" for Sedgwick County / Wichita). Required for Kansas ST-36 monthly filing worksheet.';
