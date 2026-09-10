/*
# Stage A.6 + A.7: Add misc_applies_to Columns and Custom Modifier Labels to Change Orders

## Purpose
1. Adds `misc_applies_to` to company_settings, proposals, and change_orders so the system
   can track whether Misc applies to 'materials', 'labor', or 'materials_labor'.
   This replaces the current behavior where Misc is spread proportionally across both.
   The future central tax engine will use this to classify Misc dollars correctly.

2. Adds `custom_modifier_1_label` and `custom_modifier_2_label` to change_orders so COs
   can carry the custom modifier labels inherited from the parent proposal.
   Currently these columns exist on proposal_settings but NOT on change_orders.

## Modified Tables

### company_settings
- Adds `default_misc_applies_to` (text, nullable, CHECK: 'materials' | 'labor' | 'materials_labor')
- Set to 'materials_labor' for existing org to match current proportional behavior

### proposals
- Adds `misc_applies_to` (text, nullable, same CHECK)
- No default — application copies from company_settings when creating a proposal

### change_orders
- Adds `misc_applies_to` (text, nullable, same CHECK) — inherited from parent proposal
- Adds `custom_modifier_1_label` (text, nullable) — inherited from parent proposal
- Adds `custom_modifier_2_label` (text, nullable) — inherited from parent proposal

## Security
No RLS changes — existing per-table RLS covers the new columns.

## Important Notes
1. No production calculations are changed — the new columns are nullable and start NULL
2. company_settings.default_misc_applies_to is set to 'materials_labor' to match current behavior
3. Change Orders will inherit misc_applies_to and custom modifier labels from the parent proposal
   when the application creates them (handled in a future stage, not in this migration)
*/

DO $$ BEGIN
  -- company_settings: default_misc_applies_to
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'default_misc_applies_to'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN default_misc_applies_to text
      CHECK (default_misc_applies_to IN ('materials', 'labor', 'materials_labor'));
  END IF;

  -- proposals: misc_applies_to
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'misc_applies_to'
  ) THEN
    ALTER TABLE proposals ADD COLUMN misc_applies_to text
      CHECK (misc_applies_to IN ('materials', 'labor', 'materials_labor'));
  END IF;

  -- change_orders: misc_applies_to
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'misc_applies_to'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN misc_applies_to text
      CHECK (misc_applies_to IN ('materials', 'labor', 'materials_labor'));
  END IF;

  -- change_orders: custom_modifier_1_label
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'custom_modifier_1_label'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN custom_modifier_1_label text;
  END IF;

  -- change_orders: custom_modifier_2_label
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'custom_modifier_2_label'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN custom_modifier_2_label text;
  END IF;
END $$;

-- Set default_misc_applies_to to 'materials_labor' for existing org to match current behavior
UPDATE company_settings
SET default_misc_applies_to = 'materials_labor'
WHERE default_misc_applies_to IS NULL
  AND organization_id = 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15';
