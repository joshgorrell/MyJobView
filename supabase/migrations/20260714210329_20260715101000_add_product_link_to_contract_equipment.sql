/*
# Extend security_contract_equipment for Warranty Coverage

## Summary
Adds product_id, warranty_term_months, and warranty_provider columns to the
security_contract_equipment table so equipment warranty agreements can link
covered items to the product catalog with per-item warranty details.

## New Columns on security_contract_equipment
- product_id: uuid (nullable) — FK to products(id) ON DELETE SET NULL.
  Links this equipment item to the actual product catalog entry.
  Null for existing monitoring-contract equipment rows (backward compatible).
- warranty_term_months: integer (nullable) — warranty duration for this specific item
- warranty_provider: text (nullable) — OEM or third-party warranty provider name

## Security
No RLS policy changes needed — existing table-level policies cover new columns.
*/

ALTER TABLE security_contract_equipment ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE security_contract_equipment ADD COLUMN IF NOT EXISTS warranty_term_months integer;
ALTER TABLE security_contract_equipment ADD COLUMN IF NOT EXISTS warranty_provider text;

-- Add FK constraint for product_id (drop first for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'security_contract_equipment_product_id_fkey'
  ) THEN
    ALTER TABLE security_contract_equipment
      ADD CONSTRAINT security_contract_equipment_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for product_id lookups
CREATE INDEX IF NOT EXISTS idx_security_contract_equipment_product_id
  ON security_contract_equipment(product_id);
