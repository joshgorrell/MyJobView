/*
# Stage A.8: Add Custom Modifier Tax Classification References

## Purpose
Adds nullable foreign key columns to proposal_settings and change_orders so each custom
modifier can optionally reference either a normal tax classification OR a special charge
classification. This allows the future central tax engine to determine the tax treatment of
each custom modifier based on its assigned classification rather than guessing.

If no classification is selected, the future Tax Readiness Gate will flag the modifier for
classification rather than inferring its tax treatment.

## Modified Tables

### proposal_settings
- Adds `custom_modifier_1_tax_classification_id` (uuid, nullable FK to tax_classifications)
- Adds `custom_modifier_1_special_charge_id` (uuid, nullable FK to special_charge_classifications)
- Adds `custom_modifier_2_tax_classification_id` (uuid, nullable FK to tax_classifications)
- Adds `custom_modifier_2_special_charge_id` (uuid, nullable FK to special_charge_classifications)
- CHECK constraint: each modifier can reference at most one classification type (not both)

### change_orders
- Adds the same four columns with the same CHECK constraint
- These are inherited from the parent proposal when a CO is created

## Constraint Design
For each custom modifier, a CHECK ensures at most one of (tax_classification_id, special_charge_id)
is set. Both can be NULL (meaning unclassified — flagged by the Tax Readiness Gate), but both
cannot be set simultaneously:

  CHECK (custom_modifier_N_tax_classification_id IS NULL OR custom_modifier_N_special_charge_id IS NULL)

## Security
No RLS changes — existing per-table RLS covers the new columns.

## Important Notes
1. No classifications are assigned to existing custom modifiers in this migration
2. No production calculations are changed
3. The CHECK allows both to be NULL (unclassified) but prevents both being set
*/

DO $$ BEGIN
  -- proposal_settings: custom_modifier_1_tax_classification_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'custom_modifier_1_tax_classification_id'
  ) THEN
    ALTER TABLE proposal_settings ADD COLUMN custom_modifier_1_tax_classification_id uuid;
    ALTER TABLE proposal_settings
      ADD CONSTRAINT ps_cm1_tax_class_fk
      FOREIGN KEY (custom_modifier_1_tax_classification_id) REFERENCES tax_classifications(id)
      ON DELETE SET NULL;
  END IF;

  -- proposal_settings: custom_modifier_1_special_charge_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'custom_modifier_1_special_charge_id'
  ) THEN
    ALTER TABLE proposal_settings ADD COLUMN custom_modifier_1_special_charge_id uuid;
    ALTER TABLE proposal_settings
      ADD CONSTRAINT ps_cm1_special_charge_fk
      FOREIGN KEY (custom_modifier_1_special_charge_id) REFERENCES special_charge_classifications(id)
      ON DELETE SET NULL;
  END IF;

  -- proposal_settings: custom_modifier_2_tax_classification_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'custom_modifier_2_tax_classification_id'
  ) THEN
    ALTER TABLE proposal_settings ADD COLUMN custom_modifier_2_tax_classification_id uuid;
    ALTER TABLE proposal_settings
      ADD CONSTRAINT ps_cm2_tax_class_fk
      FOREIGN KEY (custom_modifier_2_tax_classification_id) REFERENCES tax_classifications(id)
      ON DELETE SET NULL;
  END IF;

  -- proposal_settings: custom_modifier_2_special_charge_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_settings' AND column_name = 'custom_modifier_2_special_charge_id'
  ) THEN
    ALTER TABLE proposal_settings ADD COLUMN custom_modifier_2_special_charge_id uuid;
    ALTER TABLE proposal_settings
      ADD CONSTRAINT ps_cm2_special_charge_fk
      FOREIGN KEY (custom_modifier_2_special_charge_id) REFERENCES special_charge_classifications(id)
      ON DELETE SET NULL;
  END IF;

  -- change_orders: custom_modifier_1_tax_classification_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'custom_modifier_1_tax_classification_id'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN custom_modifier_1_tax_classification_id uuid;
    ALTER TABLE change_orders
      ADD CONSTRAINT co_cm1_tax_class_fk
      FOREIGN KEY (custom_modifier_1_tax_classification_id) REFERENCES tax_classifications(id)
      ON DELETE SET NULL;
  END IF;

  -- change_orders: custom_modifier_1_special_charge_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'custom_modifier_1_special_charge_id'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN custom_modifier_1_special_charge_id uuid;
    ALTER TABLE change_orders
      ADD CONSTRAINT co_cm1_special_charge_fk
      FOREIGN KEY (custom_modifier_1_special_charge_id) REFERENCES special_charge_classifications(id)
      ON DELETE SET NULL;
  END IF;

  -- change_orders: custom_modifier_2_tax_classification_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'custom_modifier_2_tax_classification_id'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN custom_modifier_2_tax_classification_id uuid;
    ALTER TABLE change_orders
      ADD CONSTRAINT co_cm2_tax_class_fk
      FOREIGN KEY (custom_modifier_2_tax_classification_id) REFERENCES tax_classifications(id)
      ON DELETE SET NULL;
  END IF;

  -- change_orders: custom_modifier_2_special_charge_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'custom_modifier_2_special_charge_id'
  ) THEN
    ALTER TABLE change_orders ADD COLUMN custom_modifier_2_special_charge_id uuid;
    ALTER TABLE change_orders
      ADD CONSTRAINT co_cm2_special_charge_fk
      FOREIGN KEY (custom_modifier_2_special_charge_id) REFERENCES special_charge_classifications(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Add CHECK constraints: each custom modifier can reference at most one classification type
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ps_cm1_either_or_check'
  ) THEN
    ALTER TABLE proposal_settings
      ADD CONSTRAINT ps_cm1_either_or_check
      CHECK (custom_modifier_1_tax_classification_id IS NULL OR custom_modifier_1_special_charge_id IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ps_cm2_either_or_check'
  ) THEN
    ALTER TABLE proposal_settings
      ADD CONSTRAINT ps_cm2_either_or_check
      CHECK (custom_modifier_2_tax_classification_id IS NULL OR custom_modifier_2_special_charge_id IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'co_cm1_either_or_check'
  ) THEN
    ALTER TABLE change_orders
      ADD CONSTRAINT co_cm1_either_or_check
      CHECK (custom_modifier_1_tax_classification_id IS NULL OR custom_modifier_1_special_charge_id IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'co_cm2_either_or_check'
  ) THEN
    ALTER TABLE change_orders
      ADD CONSTRAINT co_cm2_either_or_check
      CHECK (custom_modifier_2_tax_classification_id IS NULL OR custom_modifier_2_special_charge_id IS NULL);
  END IF;
END $$;
