/*
  # Add cancelled_by_user_id to security_contracts

  ## Summary
  Adds a `cancelled_by_user_id` column to track which staff member cancelled the contract.

  ## Changes
  - `security_contracts` table:
    - New column `cancelled_by_user_id` (uuid, FK → profiles) — the user who performed the cancellation

  ## Notes
  - Nullable, as existing cancelled contracts predate this tracking
  - Foreign key with SET NULL on delete to preserve contract record if user is removed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_contracts' AND column_name = 'cancelled_by_user_id'
  ) THEN
    ALTER TABLE security_contracts
      ADD COLUMN cancelled_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_security_contracts_cancelled_by_user_id
  ON security_contracts (cancelled_by_user_id);
